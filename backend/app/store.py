"""Data layer (Firestore, or an in-memory fake for tests). Replaces the old SQLite db.py.

Documents are plain dicts. Integer ids (what the React app uses) come from per-collection counters; the document key
is str(id). Reference data and the first Super Admin are created lazily by ensure_bootstrap() because serverless
functions have no reliable start-up hook.
"""
import copy
import json
import os
import threading
from datetime import datetime, timezone

from . import config

COLLECTIONS = ("users", "problems", "problem_updates", "history", "audit_log", "countries", "branches", "departments")

DEFAULT_COUNTRIES = ["Brazil", "Paraguay", "Uruguay", "Chile", "Panama", "Mexico", "Portugal"]
DEFAULT_BRANCHES = [("Brazil", "Head Office"), ("Paraguay", "Ciudad del Este"), ("Paraguay", "Concepción"),
                    ("Uruguay", "Main Branch"), ("Chile", "La Serena"), ("Chile", "Santiago"),
                    ("Chile", "Antofagasta"), ("Panama", "Panamá"), ("Mexico", "Main Branch"),
                    ("Portugal", "Main Branch")]
DEFAULT_DEPARTMENTS = ["Supply Chain", "Logistics", "Sales", "Finance", "Customer Service",
                       "IT / Systems", "HR", "Purchasing"]


class Conflict(Exception):
    """Optimistic-lock failure: the stored version is not the one the caller read."""


class Exists(Exception):
    """create() on a key that already exists."""


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ------------------------------------------------------------------ backends
class MemoryBackend:
    """Same interface as FirestoreBackend, kept in process memory (tests / quick local runs)."""

    def __init__(self):
        self.d: dict[str, dict[str, dict]] = {}
        self.lock = threading.RLock()

    def _c(self, coll):
        return self.d.setdefault(coll, {})

    def all(self, coll):
        with self.lock:
            return [copy.deepcopy(v) for v in self._c(coll).values()]

    def where(self, coll, field, value):
        with self.lock:
            return [copy.deepcopy(v) for v in self._c(coll).values() if v.get(field) == value]

    def get(self, coll, key):
        with self.lock:
            v = self._c(coll).get(str(key))
            return copy.deepcopy(v) if v is not None else None

    def put(self, coll, key, data):
        with self.lock:
            self._c(coll)[str(key)] = copy.deepcopy(data)

    def create(self, coll, key, data):
        with self.lock:
            if str(key) in self._c(coll):
                raise Exists(key)
            self._c(coll)[str(key)] = copy.deepcopy(data)

    def update(self, coll, key, fields):
        with self.lock:
            self._c(coll)[str(key)].update(copy.deepcopy(fields))

    def delete(self, coll, key):
        with self.lock:
            self._c(coll).pop(str(key), None)

    def cas_update(self, coll, key, expected_version, fields):
        with self.lock:
            cur = self._c(coll).get(str(key))
            if cur is None or cur.get("version") != expected_version:
                raise Conflict()
            cur.update(copy.deepcopy(fields))
            cur["version"] = expected_version + 1

    def next_id(self, coll):
        with self.lock:
            c = self._c("_counters").setdefault("ids", {})
            c[coll] = c.get(coll, 0) + 1
            return c[coll]

    def counter_at_least(self, coll, n):
        with self.lock:
            c = self._c("_counters").setdefault("ids", {})
            c[coll] = max(c.get(coll, 0), n)

    def bump(self):
        with self.lock:
            m = self._c("_counters").setdefault("data_version", {"value": 1})
            m["value"] += 1

    def version(self):
        with self.lock:
            return self._c("_counters").setdefault("data_version", {"value": 1})["value"]


class FirestoreBackend:
    def __init__(self):
        from google.cloud import firestore
        self.fs = firestore
        raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "").strip()
        if raw:
            info = json.loads(raw)
            self.db = firestore.Client.from_service_account_info(info)
        elif os.environ.get("FIRESTORE_EMULATOR_HOST"):
            from google.auth.credentials import AnonymousCredentials
            self.db = firestore.Client(project=os.environ.get("GCP_PROJECT", "gut-local"),
                                       credentials=AnonymousCredentials())
        else:
            raise RuntimeError("Set FIREBASE_SERVICE_ACCOUNT (service-account JSON), FIRESTORE_EMULATOR_HOST, "
                               "or GUT_STORE=memory.")

    def _col(self, coll):
        return self.db.collection(coll)

    def all(self, coll):
        return [d.to_dict() for d in self._col(coll).stream()]

    def where(self, coll, field, value):
        return [d.to_dict() for d in self._col(coll).where(field, "==", value).stream()]

    def get(self, coll, key):
        s = self._col(coll).document(str(key)).get()
        return s.to_dict() if s.exists else None

    def put(self, coll, key, data):
        self._col(coll).document(str(key)).set(data)

    def create(self, coll, key, data):
        from google.api_core.exceptions import AlreadyExists
        try:
            self._col(coll).document(str(key)).create(data)
        except AlreadyExists:
            raise Exists(key)

    def update(self, coll, key, fields):
        self._col(coll).document(str(key)).update(fields)

    def delete(self, coll, key):
        self._col(coll).document(str(key)).delete()

    def cas_update(self, coll, key, expected_version, fields):
        ref = self._col(coll).document(str(key))

        @self.fs.transactional
        def run(tx):
            snap = ref.get(transaction=tx)
            if not snap.exists or snap.to_dict().get("version") != expected_version:
                raise Conflict()
            tx.update(ref, {**fields, "version": expected_version + 1})
        run(self.db.transaction())

    def next_id(self, coll):
        ref = self._col("meta").document("counters")

        @self.fs.transactional
        def run(tx):
            snap = ref.get(transaction=tx)
            n = ((snap.to_dict() or {}).get(coll, 0) if snap.exists else 0) + 1
            tx.set(ref, {coll: n}, merge=True)
            return n
        return run(self.db.transaction())

    def counter_at_least(self, coll, n):
        ref = self._col("meta").document("counters")

        @self.fs.transactional
        def run(tx):
            snap = ref.get(transaction=tx)
            cur = (snap.to_dict() or {}).get(coll, 0) if snap.exists else 0
            if cur < n:
                tx.set(ref, {coll: n}, merge=True)
        run(self.db.transaction())

    def bump(self):
        self._col("meta").document("data_version").set({"value": self.fs.Increment(1)}, merge=True)

    def version(self):
        s = self._col("meta").document("data_version").get()
        return (s.to_dict() or {}).get("value", 1) if s.exists else 1


_backend = None
_booted = False
_lock = threading.Lock()


def backend():
    global _backend
    if _backend is None:
        with _lock:
            if _backend is None:
                _backend = MemoryBackend() if os.environ.get("GUT_STORE") == "memory" else FirestoreBackend()
    return _backend


def reset_for_tests():
    global _backend, _booted
    _backend, _booted = MemoryBackend(), False


# ------------------------------------------------------------------ helpers used by the API
def bump() -> None:
    """Increment the data version so open browsers know to refresh."""
    backend().bump()


def audit(user_id, action, entity=None, entity_id=None, detail=None) -> None:
    b = backend()
    i = b.next_id("audit_log")
    b.put("audit_log", i, {"id": i, "at": now(), "user_id": user_id, "action": action, "entity": entity,
                           "entity_id": None if entity_id is None else str(entity_id), "detail": detail})


def new_user(email, name, password_hash, role, scope=None, must_change=True) -> dict:
    scope = scope or {}
    return {"email": email, "name": name, "password_hash": password_hash, "role": role,
            "scope_country": scope.get("scope_country"), "scope_branch": scope.get("scope_branch"),
            "scope_department": scope.get("scope_department"), "active": True,
            "must_change_password": must_change, "token_version": 1, "created_at": now(), "last_login": None}


def ensure_bootstrap() -> None:
    """Create reference lists and the first Super Admin once (idempotent, safe if two cold starts race)."""
    global _booted
    if _booted:
        return
    from . import security
    b = backend()
    if not b.all("countries"):
        for name in DEFAULT_COUNTRIES:
            i = b.next_id("countries")
            b.put("countries", i, {"id": i, "name": name})
        for country, name in DEFAULT_BRANCHES:
            i = b.next_id("branches")
            b.put("branches", i, {"id": i, "country": country, "name": name})
        for name in DEFAULT_DEPARTMENTS:
            i = b.next_id("departments")
            b.put("departments", i, {"id": i, "name": name})
    if not b.all("users"):
        pw = config.SUPERADMIN_PASSWORD or security.temp_password()
        u = new_user(config.SUPERADMIN_EMAIL.strip().lower(), config.SUPERADMIN_NAME, security.hash_password(pw),
                     "super_admin", must_change=not config.SUPERADMIN_PASSWORD)
        u["id"] = 1
        try:
            b.create("users", 1, u)
            b.counter_at_least("users", 1)
            if not config.SUPERADMIN_PASSWORD:
                print(f"\n=== INITIAL SUPER ADMIN ===\n e-mail:   {u['email']}\n password: {pw}\n"
                      " (shown once; you must change it at first login)\n===========================\n", flush=True)
        except Exists:
            pass
    _booted = True


def db():
    """FastAPI dependency: returns the backend after making sure the first-run data exists."""
    ensure_bootstrap()
    return backend()
