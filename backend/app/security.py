import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from . import config

def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.scrypt(pw.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${dk.hex()}"


def verify_password(pw: str, stored: str) -> bool:
    try:
        _, salt, dk = stored.split("$")
        calc = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1, dklen=32)
        return hmac.compare_digest(calc.hex(), dk)
    except Exception:
        return False


def password_problem(pw: str, email: str = "") -> str | None:
    if len(pw) < 10:
        return "A senha deve ter no mínimo 10 caracteres."
    if pw.lower() == email.lower():
        return "A senha não pode ser igual ao e-mail."
    if pw.isdigit() or pw.isalpha():
        return "Use uma combinação de letras e números."
    return None


def temp_password() -> str:
    return secrets.token_urlsafe(9) + "7a"


def _sign(payload: str) -> str:
    return hmac.new(config.SESSION_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def create_session(user: dict) -> str:
    """Stateless signed cookie: uid + the user's token_version + expiry. Bumping token_version revokes it."""
    body = {"uid": user["id"], "tv": user.get("token_version", 1), "exp": int(time.time()) + config.SESSION_DAYS * 86400}
    payload = base64.urlsafe_b64encode(json.dumps(body).encode()).decode()
    return payload + "." + _sign(payload)


def user_from_token(b, token: str | None):
    if not token or "." not in token:
        return None
    payload, sig = token.rsplit(".", 1)
    if not hmac.compare_digest(sig, _sign(payload)):
        return None
    try:
        body = json.loads(base64.urlsafe_b64decode(payload.encode()))
    except Exception:
        return None
    if body.get("exp", 0) < time.time():
        return None
    u = b.get("users", body.get("uid"))
    if not u or not u["active"] or u.get("token_version", 1) != body.get("tv"):
        return None
    return u


def revoke_user_sessions(b, user_id: int) -> None:
    u = b.get("users", user_id)
    if u:
        b.update("users", user_id, {"token_version": u.get("token_version", 1) + 1})


# Login rate-limit lives in the database so it holds across serverless instances.
def _attempt_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def too_many_attempts(b, key: str, limit: int = 8, window: int = 900) -> bool:
    doc = b.get("login_attempts", _attempt_key(key)) or {}
    now = time.time()
    return len([t for t in doc.get("hits", []) if now - t < window]) >= limit


def register_failure(b, key: str, window: int = 900) -> None:
    k, now = _attempt_key(key), time.time()
    hits = [t for t in (b.get("login_attempts", k) or {}).get("hits", []) if now - t < window]
    b.put("login_attempts", k, {"hits": hits + [now]})


def clear_failures(b, key: str) -> None:
    b.delete("login_attempts", _attempt_key(key))
