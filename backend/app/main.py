"""GUT Matrix – multi-user problem prioritisation app (FastAPI + Firestore)."""
import csv
import io
import os
import re
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from . import config, security, store
from .store import Conflict, audit, bump, db, now
from .gut import CLOSED, PRIORITIES, PRIORITY_NAMES, SCALES, SOURCES, STATUSES, derive
from .permissions import (CONTENT_FIELDS, PLAN_FIELDS, ROLES, VALIDATION_FIELDS, can_add_update, can_create,
                          can_view, editable_fields)

COOKIE = "gut_session"
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

FIELD_LABELS = {
    "title": "Title", "description": "Description", "evidence": "Evidence", "operational_impact": "Operational impact",
    "consequences": "Consequences", "source": "Problem source", "process": "Impacted process",
    "impacted_area": "Impacted area", "suggested_action": "Suggested action", "country": "Country",
    "branch": "Branch", "department": "Department", "gravity": "Gravity", "urgency": "Urgency", "trend": "Trend",
    "g_just": "Gravity justification", "u_just": "Urgency justification", "t_just": "Trend justification",
    "v_gravity": "Validated gravity", "v_urgency": "Validated urgency", "v_trend": "Validated trend",
    "responsible_id": "Responsible person", "action_plan": "Action plan", "planned_start": "Planned start",
    "deadline": "Deadline", "status": "Status", "gut_score": "Preliminary GUT score",
    "final_score": "GUT score", "priority": "Priority", "progress_update": "Progress update",
}
TRACKED = ["title", "description", "evidence", "operational_impact", "consequences", "source", "process",
           "impacted_area", "suggested_action", "country", "branch", "department", "gravity", "urgency", "trend",
           "g_just", "u_just", "t_just", "v_gravity", "v_urgency", "v_trend", "responsible_id", "action_plan",
           "planned_start", "deadline", "status", "gut_score", "final_score", "priority"]
# Fields hidden from the "Recent updates" feed (still present in each problem's History tab).
FEED_HIDE = {"gravity", "urgency", "trend", "g_just", "u_just", "t_just", "v_gravity", "v_urgency", "v_trend",
             "gut_score", "evidence", "operational_impact", "consequences", "source", "process", "impacted_area",
             "suggested_action", "planned_start"}


# ------------------------------------------------------------------ app
@asynccontextmanager
async def lifespan(app):
    store.ensure_bootstrap()      # also runs lazily on the first request (serverless has no reliable start-up hook)
    yield


app = FastAPI(title="GUT Matrix", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def guard(request: Request, call_next):
    if request.url.path.startswith("/api") and request.method in ("POST", "PUT", "PATCH", "DELETE"):
        if request.headers.get("x-requested-with") != "gut":      # CSRF: browsers can't add this cross-site
            return JSONResponse({"detail": "Missing CSRF header"}, status_code=403)
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "same-origin"
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'")
    if request.url.path.startswith("/api"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


# ------------------------------------------------------------------ auth dependencies
def auth_any(request: Request, b=Depends(db)):
    u = security.user_from_token(b, request.cookies.get(COOKIE))
    if not u:
        raise HTTPException(401, "Not authenticated")
    return u


def auth(u=Depends(auth_any)):
    if u["must_change_password"]:
        raise HTTPException(403, "password_change_required")
    return u


def admin(u=Depends(auth)):
    if u["role"] != "super_admin":
        raise HTTPException(403, "Super Admin only")
    return u


def is_https(request: Request) -> bool:
    if config.COOKIE_SECURE in ("1", "0"):
        return config.COOKIE_SECURE == "1"
    return request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"


def user_out(u) -> dict:
    return {"id": u["id"], "email": u["email"], "name": u["name"], "role": u["role"], "active": bool(u["active"]),
            "scope_country": u["scope_country"], "scope_branch": u["scope_branch"],
            "scope_department": u["scope_department"], "must_change_password": bool(u["must_change_password"]),
            "created_at": u["created_at"], "last_login": u["last_login"]}


def set_session_cookie(response: Response, request: Request, user: dict) -> None:
    response.set_cookie(COOKIE, security.create_session(user), httponly=True, samesite="lax",
                        secure=is_https(request), max_age=config.SESSION_DAYS * 86400, path="/")


# ------------------------------------------------------------------ models
class Login(BaseModel):
    email: str
    password: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


Score = Field(ge=1, le=5)


class ProblemIn(BaseModel):
    country: str = Field(max_length=80)
    branch: str = Field(max_length=80)
    department: str = Field(max_length=80)
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=1, max_length=5000)
    evidence: str = Field("", max_length=5000)
    operational_impact: str = Field("", max_length=5000)
    consequences: str = Field("", max_length=5000)
    source: str = Field("", max_length=120)
    process: str = Field("", max_length=120)
    impacted_area: str = Field("", max_length=120)
    suggested_action: str = Field("", max_length=5000)
    gravity: int = Score
    urgency: int = Score
    trend: int = Score
    g_just: str = Field("", max_length=2000)
    u_just: str = Field("", max_length=2000)
    t_just: str = Field("", max_length=2000)


class ProblemPatch(BaseModel):
    version: int
    country: Optional[str] = Field(None, max_length=80)
    branch: Optional[str] = Field(None, max_length=80)
    department: Optional[str] = Field(None, max_length=80)
    title: Optional[str] = Field(None, min_length=3, max_length=200)
    description: Optional[str] = Field(None, max_length=5000)
    evidence: Optional[str] = Field(None, max_length=5000)
    operational_impact: Optional[str] = Field(None, max_length=5000)
    consequences: Optional[str] = Field(None, max_length=5000)
    source: Optional[str] = Field(None, max_length=120)
    process: Optional[str] = Field(None, max_length=120)
    impacted_area: Optional[str] = Field(None, max_length=120)
    suggested_action: Optional[str] = Field(None, max_length=5000)
    gravity: Optional[int] = Field(None, ge=1, le=5)
    urgency: Optional[int] = Field(None, ge=1, le=5)
    trend: Optional[int] = Field(None, ge=1, le=5)
    g_just: Optional[str] = Field(None, max_length=2000)
    u_just: Optional[str] = Field(None, max_length=2000)
    t_just: Optional[str] = Field(None, max_length=2000)
    v_gravity: Optional[int] = Field(None, ge=1, le=5)
    v_urgency: Optional[int] = Field(None, ge=1, le=5)
    v_trend: Optional[int] = Field(None, ge=1, le=5)
    responsible_id: Optional[int] = None
    action_plan: Optional[str] = Field(None, max_length=5000)
    planned_start: Optional[str] = None
    deadline: Optional[str] = None
    status: Optional[str] = None

    @field_validator("planned_start", "deadline")
    @classmethod
    def _date(cls, v):
        if v in (None, ""):
            return None
        if not DATE_RE.match(v):
            raise ValueError("Use YYYY-MM-DD")
        date.fromisoformat(v)
        return v


class UpdateIn(BaseModel):
    body: str = Field(min_length=1, max_length=3000)


class UserIn(BaseModel):
    email: str = Field(max_length=200)
    name: str = Field(min_length=1, max_length=120)
    role: str
    scope_country: Optional[str] = None
    scope_branch: Optional[str] = None
    scope_department: Optional[str] = None


class UserPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    role: Optional[str] = None
    active: Optional[bool] = None
    scope_country: Optional[str] = None
    scope_branch: Optional[str] = None
    scope_department: Optional[str] = None


class OrgIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    country: Optional[str] = None


# ------------------------------------------------------------------ helpers
def today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def stale_cutoff() -> str:
    return (datetime.now(timezone.utc) - timedelta(days=config.STALE_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")


def serialize(row, user) -> dict:
    d = dict(row)
    d.pop("deleted_by", None)
    d["open"] = d["status"] not in CLOSED
    d["overdue"] = bool(d["open"] and d["deadline"] and d["deadline"] < today_str())
    d["stale"] = bool(d["open"] and d["last_activity_at"] < stale_cutoff())
    d["permissions"] = {"fields": sorted(editable_fields(user, d)), "can_update": can_add_update(user, d),
                        "can_delete": user["role"] == "super_admin"}
    return d


def user_names(b) -> dict:
    return {u["id"]: u["name"] for u in b.all("users")}


def enrich(p: dict, names: dict) -> dict:
    """What the old BASE_SELECT JOINs added: the display names of the people on a problem."""
    return {**p, "created_by_name": names.get(p["created_by"]), "responsible_name": names.get(p["responsible_id"]),
            "updated_by_name": names.get(p["updated_by"]), "validated_by_name": names.get(p["validated_by"])}


def load_problems(b, names=None, include_deleted=False) -> list:
    names = names if names is not None else user_names(b)
    return [enrich(p, names) for p in b.all("problems") if include_deleted or not p.get("deleted_at")]


def fetch_problem(b, pid: int, user):
    p = b.get("problems", pid)
    if not p or p.get("deleted_at") or not can_view(user, p):
        raise HTTPException(404, "Problem not found")
    names = {}
    for key in ("created_by", "responsible_id", "updated_by", "validated_by"):
        uid = p.get(key)
        if uid and uid not in names:
            row = b.get("users", uid)
            names[uid] = row["name"] if row else None
    return enrich(p, names)


def validate_geo(b, country, branch, department):
    if not any(x["country"] == country and x["name"] == branch for x in b.all("branches")):
        raise HTTPException(422, f"Branch '{branch}' does not exist in {country}.")
    if not any(x["name"] == department for x in b.all("departments")):
        raise HTTPException(422, f"Department '{department}' does not exist.")


def log(b, pid, uid, kind, field=None, old=None, new=None, at=None):
    i = b.next_id("history")
    b.put("history", i, {"id": i, "problem_id": pid, "user_id": uid, "at": at or now(), "kind": kind,
                         "field": field, "old_value": old, "new_value": new})


def as_text(v):
    return None if v in (None, "") else str(v)


def _contains(hay, needle) -> bool:
    return needle in (hay or "").lower()


def filter_problems(user, rows: list, q: dict) -> list:
    """Python version of the old SQL WHERE built from the query string (visibility + filters + views)."""
    for key in ("created_from", "created_to", "deadline_from", "deadline_to"):
        if q.get(key) and not DATE_RE.match(q[key]):
            raise HTTPException(422, f"Invalid date for {key}")
    resp = q.get("responsible")
    if resp and resp != "none":
        try:
            resp = int(resp)
        except ValueError:
            raise HTTPException(422, "Invalid responsible")
    needle = q["q"].strip().lower() if q.get("q") else ""
    digits = re.sub(r"\D", "", q["q"]) if q.get("q") else ""
    view = q.get("view")
    closed_hidden = q.get("open") == "1" or view in ("no_plan", "overdue", "mine", "stale", "plans")
    today, cutoff = today_str(), stale_cutoff()
    out = []
    for p in rows:
        if not can_view(user, p):
            continue
        if any(q.get(k) and p[k] != q[k] for k in ("country", "branch", "department", "priority", "status")):
            continue
        if resp == "none" and p["responsible_id"] is not None:
            continue
        if resp and resp != "none" and p["responsible_id"] != resp:
            continue
        if q.get("created_from") and p["created_at"][:10] < q["created_from"]:
            continue
        if q.get("created_to") and p["created_at"][:10] > q["created_to"]:
            continue
        if q.get("deadline_from") and not (p["deadline"] and p["deadline"] >= q["deadline_from"]):
            continue
        if q.get("deadline_to") and not (p["deadline"] and p["deadline"] <= q["deadline_to"]):
            continue
        if needle and not (_contains(p["title"], needle) or _contains(p["description"], needle)
                           or _contains(p["responsible_name"], needle) or _contains(p["created_by_name"], needle)
                           or (digits and p["id"] == int(digits))):
            continue
        if closed_hidden and p["status"] in CLOSED:
            continue
        if view == "no_plan" and p["action_plan"].strip():
            continue
        if view == "overdue" and not (p["deadline"] and p["deadline"] < today):
            continue
        if view == "mine" and p["responsible_id"] != user["id"]:
            continue
        if view == "stale" and not p["last_activity_at"] < cutoff:
            continue
        out.append(p)
    return out


def visible_rows(b, u, q=None):
    return [serialize(r, u) for r in filter_problems(u, load_problems(b), q or {})]


# ------------------------------------------------------------------ health check
@app.get("/healthz", include_in_schema=False)
def healthz():
    return PlainTextResponse("ok")


# ------------------------------------------------------------------ auth routes
@app.post("/api/auth/login")
def login(body: Login, request: Request, response: Response, b=Depends(db)):
    email = body.email.strip().lower()
    key = f"{request.client.host if request.client else '?'}|{email}"
    if security.too_many_attempts(b, key):
        raise HTTPException(429, "Too many attempts. Try again in 15 minutes.")
    found = b.where("users", "email", email)
    u = found[0] if found else None
    ok = bool(u and u["active"] and security.verify_password(body.password, u["password_hash"]))
    if not u:
        security.verify_password(body.password, "scrypt$00$00")   # keep timing similar
    if not ok:
        security.register_failure(b, key)
        audit(u["id"] if u else None, "login_failed", "user", email)
        raise HTTPException(401, "Invalid e-mail or password.")
    security.clear_failures(b, key)
    b.update("users", u["id"], {"last_login": now()})
    audit(u["id"], "login", "user", u["id"])
    set_session_cookie(response, request, u)
    return user_out(u)


@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@app.get("/api/auth/me")
def me(u=Depends(auth_any)):
    return user_out(u)


@app.post("/api/auth/change-password")
def change_password(body: PasswordChange, request: Request, response: Response, u=Depends(auth_any), b=Depends(db)):
    if not security.verify_password(body.current_password, u["password_hash"]):
        raise HTTPException(400, "Current password is incorrect.")
    problem = security.password_problem(body.new_password, u["email"])
    if problem:
        raise HTTPException(422, problem)
    if body.new_password == body.current_password:
        raise HTTPException(422, "Choose a different password.")
    b.update("users", u["id"], {"password_hash": security.hash_password(body.new_password),
                                "must_change_password": False})
    security.revoke_user_sessions(b, u["id"])          # signs out every other device...
    set_session_cookie(response, request, b.get("users", u["id"]))     # ...but keeps this one
    audit(u["id"], "password_changed", "user", u["id"])
    return {"ok": True}


# ------------------------------------------------------------------ meta / version
@app.get("/api/meta")
def meta(u=Depends(auth), b=Depends(db)):
    by_id = lambda rows: sorted(rows, key=lambda r: r["id"])
    return {
        "me": user_out(u),
        "countries": [r["name"] for r in by_id(b.all("countries"))],
        "branches": [{"country": r["country"], "name": r["name"]} for r in by_id(b.all("branches"))],
        "departments": [r["name"] for r in by_id(b.all("departments"))],
        "statuses": STATUSES, "priorities": [{"name": n, "min": m} for n, m in PRIORITIES],
        "sources": SOURCES, "scales": SCALES, "roles": list(ROLES), "stale_days": config.STALE_DAYS,
        "users": [{"id": r["id"], "name": r["name"], "role": r["role"]} for r in
                  sorted((x for x in b.all("users") if x["active"]), key=lambda x: x["name"])],
    }


@app.get("/api/version")
def version(u=Depends(auth), b=Depends(db)):
    return {"v": b.version()}


# ------------------------------------------------------------------ problems
def _sort_key(sort: str):
    return {
        "id": lambda p: p["id"], "created_at": lambda p: p["created_at"], "title": lambda p: p["title"].lower(),
        "score": lambda p: p["final_score"], "status": lambda p: p["status"], "updated_at": lambda p: p["updated_at"],
        "responsible": lambda p: (p["responsible_name"] or "").lower(), "country": lambda p: p["country"],
        "department": lambda p: p["department"],
    }.get(sort)


def sort_problems(rows: list, sort: str, direction: str) -> list:
    desc = direction != "asc"
    rows = sorted(rows, key=lambda p: p["id"], reverse=True)          # tie-breaker: newest id first
    if sort == "deadline":                                            # no deadline always last
        have = sorted((p for p in rows if p["deadline"]), key=lambda p: p["deadline"], reverse=desc)
        return have + [p for p in rows if not p["deadline"]]
    return sorted(rows, key=_sort_key(sort) or _sort_key("created_at"), reverse=desc)


@app.get("/api/problems")
def list_problems(request: Request, sort: str = "created_at", dir: str = "desc", limit: int = Query(25, ge=1, le=200),
                  offset: int = Query(0, ge=0), u=Depends(auth), b=Depends(db)):
    rows = filter_problems(u, load_problems(b), dict(request.query_params))
    rows = sort_problems(rows, sort, dir)
    items = []
    for r in rows[offset:offset + limit]:
        d = serialize(r, u)
        for k in ("description", "evidence", "operational_impact", "consequences", "suggested_action",
                  "g_just", "u_just", "t_just"):
            d.pop(k, None)
        d["action_plan"] = d["action_plan"][:200]
        items.append(d)
    return {"items": items, "total": len(rows)}


@app.post("/api/problems", status_code=201)
def create_problem(body: ProblemIn, u=Depends(auth), b=Depends(db)):
    d = {k: (v.strip() if isinstance(v, str) else v) for k, v in body.model_dump().items()}
    validate_geo(b, d["country"], d["branch"], d["department"])
    if not can_create(u, d["country"], d["branch"], d["department"]):
        raise HTTPException(403, "You cannot register problems for this country/branch/department.")
    derive(d)
    ts = now()
    pid = b.next_id("problems")
    b.put("problems", pid, {
        **d, "id": pid, "created_at": ts, "created_by": u["id"], "v_gravity": None, "v_urgency": None,
        "v_trend": None, "validated_by": None, "validated_at": None, "responsible_id": None, "action_plan": "",
        "planned_start": None, "deadline": None, "status": "New", "updated_at": ts, "updated_by": u["id"],
        "last_activity_at": ts, "completed_at": None, "version": 1, "deleted_at": None, "deleted_by": None})
    log(b, pid, u["id"], "created", None, None, d["title"], ts)
    bump()
    return serialize(fetch_problem(b, pid, u), u)


@app.get("/api/problems/{pid}")
def get_problem(pid: int, u=Depends(auth), b=Depends(db)):
    return serialize(fetch_problem(b, pid, u), u)


@app.patch("/api/problems/{pid}")
def patch_problem(pid: int, body: ProblemPatch, u=Depends(auth), b=Depends(db)):
    row = fetch_problem(b, pid, u)
    p = dict(row)
    data = body.model_dump(exclude_unset=True)
    version_sent = data.pop("version")
    if version_sent != p["version"]:
        raise HTTPException(409, "This problem was changed by someone else. Reload and try again.")
    allowed = editable_fields(u, p)
    forbidden = [k for k in data if k not in allowed]
    if forbidden:
        raise HTTPException(403, f"You are not allowed to change: {', '.join(forbidden)}")
    for k, v in list(data.items()):
        if isinstance(v, str):
            data[k] = v.strip()
    for k in ("planned_start", "deadline"):
        if k in data and not data[k]:
            data[k] = None
    if "status" in data and data["status"] not in STATUSES:
        raise HTTPException(422, "Unknown status.")
    if data.get("responsible_id") is not None:
        r = b.get("users", data["responsible_id"])
        if not r or not r["active"]:
            raise HTTPException(422, "Responsible user does not exist or is inactive.")
    for k in ("title", "description"):
        if k in data and not data[k]:
            raise HTTPException(422, f"{FIELD_LABELS[k]} cannot be empty.")
    merged = {**p, **data}
    if any(k in data for k in ("country", "branch", "department")):
        validate_geo(b, merged["country"], merged["branch"], merged["department"])
        if not can_create(u, merged["country"], merged["branch"], merged["department"]):
            raise HTTPException(403, "That country/branch/department is outside your scope.")
    trio = [merged["v_gravity"], merged["v_urgency"], merged["v_trend"]]
    if any(trio) and not all(trio):
        raise HTTPException(422, "Validated gravity, urgency and trend must all be set, or all cleared.")
    derive(merged)
    ts = now()
    if any(merged[k] != p[k] for k in VALIDATION_FIELDS):
        merged["validated_by"], merged["validated_at"] = (u["id"], ts) if all(trio) else (None, None)
    if merged["status"] == "Completed" and p["status"] != "Completed":
        merged["completed_at"] = ts
    elif merged["status"] != "Completed":
        merged["completed_at"] = None
    names = user_names(b)
    changes = []
    for f in TRACKED:
        if merged[f] != p[f]:
            if f == "responsible_id":
                old, new = names.get(p[f]), names.get(merged[f])
            else:
                old, new = as_text(p[f]), as_text(merged[f])
            changes.append((f, old, new))
    if not changes:
        return serialize(row, u)
    cols = sorted(CONTENT_FIELDS | PLAN_FIELDS | VALIDATION_FIELDS) + [
        "gut_score", "v_score", "final_score", "priority", "validated_by", "validated_at", "completed_at"]
    fields = {c: merged[c] for c in cols}
    fields.update(updated_at=ts, updated_by=u["id"], last_activity_at=ts)
    try:
        b.cas_update("problems", pid, p["version"], fields)      # bumps version atomically; fails if someone else won
    except Conflict:
        raise HTTPException(409, "This problem was changed by someone else. Reload and try again.")
    for f, old, new in changes:
        log(b, pid, u["id"], "change", f, old, new, ts)
    bump()
    return serialize(fetch_problem(b, pid, u), u)


@app.delete("/api/problems/{pid}")
def delete_problem(pid: int, u=Depends(admin), b=Depends(db)):
    row = fetch_problem(b, pid, u)
    ts = now()
    b.update("problems", pid, {"deleted_at": ts, "deleted_by": u["id"]})
    log(b, pid, u["id"], "deleted", None, row["title"], None, ts)
    audit(u["id"], "problem_deleted", "problem", pid, row["title"])
    bump()
    return {"ok": True}


@app.get("/api/problems/{pid}/history")
def problem_history(pid: int, u=Depends(auth), b=Depends(db)):
    fetch_problem(b, pid, u)
    names = user_names(b)
    rows = sorted(b.where("history", "problem_id", pid), key=lambda r: r["id"], reverse=True)
    return [{**r, "user_name": names.get(r["user_id"]), "field_label": FIELD_LABELS.get(r["field"], r["field"])}
            for r in rows]


@app.get("/api/problems/{pid}/updates")
def list_updates(pid: int, u=Depends(auth), b=Depends(db)):
    fetch_problem(b, pid, u)
    names = user_names(b)
    rows = sorted(b.where("problem_updates", "problem_id", pid), key=lambda r: r["id"], reverse=True)
    return [{**r, "user_name": names.get(r["user_id"])} for r in rows]


@app.post("/api/problems/{pid}/updates", status_code=201)
def add_update(pid: int, body: UpdateIn, u=Depends(auth), b=Depends(db)):
    row = fetch_problem(b, pid, u)
    if not can_add_update(u, row):
        raise HTTPException(403, "You cannot add updates to this problem.")
    ts = now()
    text = body.body.strip()
    if not text:
        raise HTTPException(422, "Write something first.")
    i = b.next_id("problem_updates")
    b.put("problem_updates", i, {"id": i, "problem_id": pid, "user_id": u["id"], "created_at": ts, "body": text})
    b.update("problems", pid, {"updated_at": ts, "updated_by": u["id"], "last_activity_at": ts})
    log(b, pid, u["id"], "update", "progress_update", None, text[:300], ts)
    bump()
    return {"ok": True}


# ------------------------------------------------------------------ recent updates feed
@app.get("/api/updates")
def feed(since: Optional[str] = None, limit: int = Query(300, ge=1, le=1000), u=Depends(auth), b=Depends(db)):
    if since is None:
        since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
    if not re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", since):
        raise HTTPException(422, "Invalid 'since'")
    names = user_names(b)
    problems = {p["id"]: p for p in b.all("problems") if not p.get("deleted_at") and can_view(u, p)}
    rows = [h for h in b.all("history") if h["at"] >= since and h["problem_id"] in problems
            and (h["kind"] in ("created", "update") or h["field"] not in FEED_HIDE)]
    rows.sort(key=lambda h: h["id"], reverse=True)
    return [{**h, "user_name": names.get(h["user_id"]), "problem_title": problems[h["problem_id"]]["title"],
             "field_label": FIELD_LABELS.get(h["field"], h["field"])} for h in rows[:limit]]


# ------------------------------------------------------------------ dashboard & reports
@app.get("/api/dashboard")
def dashboard(country: str = "", branch: str = "", department: str = "", u=Depends(auth), b=Depends(db)):
    q = {k: v for k, v in (("country", country), ("branch", branch), ("department", department)) if v}
    rows = visible_rows(b, u, q)
    opn = [r for r in rows if r["open"]]
    by = lambda key: sorted(
        ({"name": k, **{p: sum(1 for r in opn if r[key] == k and r["priority"] == p) for p in PRIORITY_NAMES},
          "total": sum(1 for r in opn if r[key] == k)} for k in {r[key] for r in opn}),
        key=lambda x: (-x["total"], x["name"]))
    scores = [r["final_score"] for r in opn]
    top = sorted(opn, key=lambda r: (-r["final_score"], r["created_at"]))
    slim = lambda r: {k: r[k] for k in ("id", "title", "country", "branch", "department", "gravity", "urgency", "trend",
                                         "final_score", "priority", "status", "responsible_name", "deadline", "overdue")}
    def eff(r):
        v = bool(r["v_score"])
        return {**slim(r), "g": r["v_gravity"] if v else r["gravity"], "u": r["v_urgency"] if v else r["urgency"],
                "t": r["v_trend"] if v else r["trend"], "validated": v}
    return {
        "kpis": {
            "open": len(opn), "new": sum(1 for r in opn if r["status"] == "New"),
            "critical": sum(1 for r in opn if r["priority"] == "Critical"),
            "high_priority": sum(1 for r in opn if r["priority"] in ("Very High", "High")),
            "in_progress": sum(1 for r in rows if r["status"] == "In Progress"),
            "overdue": sum(1 for r in opn if r["overdue"]),
            "completed": sum(1 for r in rows if r["status"] == "Completed"),
            "stale": sum(1 for r in opn if r["stale"]),
            "avg_score": round(sum(scores) / len(scores), 1) if scores else 0,
            "total": len(rows),
        },
        "top10": [slim(r) for r in top[:10]],
        "map": [eff(r) for r in top],
        "by_country": by("country"), "by_branch": by("branch"), "by_department": by("department"),
        "by_priority": [{"name": p, "count": sum(1 for r in opn if r["priority"] == p)} for p in PRIORITY_NAMES],
        "by_status": [{"name": s, "count": sum(1 for r in rows if r["status"] == s)} for s in STATUSES],
    }


@app.get("/api/reports/summary")
def report_summary(group: str = "country", u=Depends(auth), b=Depends(db)):
    if group not in ("country", "branch", "department"):
        raise HTTPException(422, "group must be country, branch or department")
    rows = visible_rows(b, u)
    today = datetime.now(timezone.utc)
    out = []
    for k in sorted({r[group] for r in rows}):
        g = [r for r in rows if r[group] == k]
        o = [r for r in g if r["open"]]
        ages = [(today - datetime.strptime(r["created_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).days for r in o]
        out.append({"name": k, "total": len(g), "open": len(o), "completed": sum(1 for r in g if r["status"] == "Completed"),
                    **{p: sum(1 for r in o if r["priority"] == p) for p in PRIORITY_NAMES},
                    "overdue": sum(1 for r in o if r["overdue"]),
                    "avg_score": round(sum(r["final_score"] for r in o) / len(o), 1) if o else 0,
                    "avg_age_days": round(sum(ages) / len(ages), 1) if ages else 0})
    out.sort(key=lambda x: (-x["Critical"], -x["open"], x["name"]))
    return out


@app.get("/api/reports/trend")
def report_trend(weeks: int = Query(12, ge=4, le=52), u=Depends(auth), b=Depends(db)):
    rows = visible_rows(b, u)
    start = datetime.now(timezone.utc).date()
    start -= timedelta(days=start.weekday())
    out = []
    for i in range(weeks - 1, -1, -1):
        a = start - timedelta(weeks=i)
        e = a + timedelta(days=7)
        def inside(ts):
            return bool(ts) and a.isoformat() <= ts[:10] < e.isoformat()
        out.append({"week": a.isoformat(), "created": sum(1 for r in rows if inside(r["created_at"])),
                    "completed": sum(1 for r in rows if inside(r["completed_at"]))})
    return out


def csv_safe(v):
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s


@app.get("/api/export/problems.csv")
def export_problems(request: Request, u=Depends(auth), b=Depends(db)):
    rows = filter_problems(u, load_problems(b), dict(request.query_params))
    rows.sort(key=lambda r: (-r["final_score"], r["id"]))
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Problem ID", "Creation date", "Created by", "Country", "Branch", "Department", "Problem", "Description",
                "Evidence", "Operational impact", "Gravity", "Urgency", "Trend", "GUT score", "Priority",
                "Responsible person", "Action plan", "Deadline", "Status", "Last update", "Updated by"])
    for r in rows:
        w.writerow([csv_safe(x) for x in (r["id"], r["created_at"], r["created_by_name"], r["country"], r["branch"],
                    r["department"], r["title"], r["description"], r["evidence"], r["operational_impact"],
                    r["gravity"], r["urgency"], r["trend"], r["final_score"], r["priority"], r["responsible_name"],
                    r["action_plan"], r["deadline"], r["status"], r["updated_at"], r["updated_by_name"])])
    return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="gut-problems.csv"'})


@app.get("/api/export/history.csv")
def export_history(u=Depends(admin), b=Depends(db)):
    names = user_names(b)
    titles = {p["id"]: p["title"] for p in b.all("problems")}
    rows = sorted((h for h in b.all("history") if h["problem_id"] in titles), key=lambda h: h["id"])
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Date/time (UTC)", "Problem ID", "Problem", "Changed by", "Kind", "Field", "Previous value", "New value"])
    for r in rows:
        w.writerow([csv_safe(x) for x in (r["at"], r["problem_id"], titles[r["problem_id"]], names.get(r["user_id"]),
                    r["kind"], FIELD_LABELS.get(r["field"], r["field"]), r["old_value"], r["new_value"])])
    return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="gut-history.csv"'})


# ------------------------------------------------------------------ users (Super Admin)
def check_scope(b, d):
    if d.get("scope_country") and not b.where("countries", "name", d["scope_country"]):
        raise HTTPException(422, "Unknown country in scope.")
    if d.get("scope_branch"):
        if not d.get("scope_country") or not any(
                x["country"] == d["scope_country"] and x["name"] == d["scope_branch"] for x in b.all("branches")):
            raise HTTPException(422, "Branch scope needs a valid country and branch.")
    if d.get("scope_department") and not b.where("departments", "name", d["scope_department"]):
        raise HTTPException(422, "Unknown department in scope.")


@app.get("/api/users")
def list_users(u=Depends(admin), b=Depends(db)):
    rows = sorted(b.all("users"), key=lambda r: r["name"])
    rows.sort(key=lambda r: not r["active"])
    return [user_out(r) for r in rows]


@app.post("/api/users", status_code=201)
def create_user(body: UserIn, u=Depends(admin), b=Depends(db)):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Invalid e-mail.")
    if body.role not in ROLES:
        raise HTTPException(422, "Invalid role.")
    d = {k: (v or None) for k, v in body.model_dump().items() if k.startswith("scope_")}
    check_scope(b, d)
    if b.where("users", "email", email):
        raise HTTPException(409, "A user with this e-mail already exists.")
    pw = security.temp_password()
    uid = b.next_id("users")
    rec = store.new_user(email, body.name.strip(), security.hash_password(pw), body.role, d)
    rec["id"] = uid
    b.put("users", uid, rec)
    audit(u["id"], "user_created", "user", uid, f"{email} ({body.role})")
    bump()
    return {"user": user_out(rec), "temporary_password": pw}


@app.patch("/api/users/{uid}")
def patch_user(uid: int, body: UserPatch, u=Depends(admin), b=Depends(db)):
    target = b.get("users", uid)
    if not target:
        raise HTTPException(404, "User not found")
    data = body.model_dump(exclude_unset=True)
    if "role" in data and data["role"] not in ROLES:
        raise HTTPException(422, "Invalid role.")
    for k in ("scope_country", "scope_branch", "scope_department"):
        if k in data:
            data[k] = data[k] or None
    check_scope(b, {**target, **data})
    if uid == u["id"] and (data.get("active") is False or data.get("role", "super_admin") != "super_admin"):
        raise HTTPException(422, "You cannot deactivate or demote yourself.")
    if not data:
        return user_out(target)
    b.update("users", uid, data)
    if data.get("active") is False or "role" in data:
        security.revoke_user_sessions(b, uid)
    audit(u["id"], "user_updated", "user", uid, ", ".join(f"{k}={v}" for k, v in data.items()))
    bump()
    return user_out(b.get("users", uid))


@app.post("/api/users/{uid}/reset-password")
def reset_password(uid: int, u=Depends(admin), b=Depends(db)):
    if not b.get("users", uid):
        raise HTTPException(404, "User not found")
    pw = security.temp_password()
    b.update("users", uid, {"password_hash": security.hash_password(pw), "must_change_password": True})
    security.revoke_user_sessions(b, uid)
    audit(u["id"], "password_reset", "user", uid)
    return {"temporary_password": pw}


@app.get("/api/audit")
def audit_log(u=Depends(admin), b=Depends(db)):
    names = user_names(b)
    rows = sorted(b.all("audit_log"), key=lambda r: r["id"], reverse=True)[:300]
    return [{**r, "user_name": names.get(r["user_id"])} for r in rows]


# ------------------------------------------------------------------ organisation structure (Super Admin)
@app.get("/api/org")
def org_lists(u=Depends(admin), b=Depends(db)):
    by_id = lambda coll: sorted(b.all(coll), key=lambda r: r["id"])
    return {"countries": by_id("countries"), "branches": by_id("branches"), "departments": by_id("departments")}


@app.post("/api/org/countries", status_code=201)
def add_country(body: OrgIn, u=Depends(admin), b=Depends(db)):
    name = body.name.strip()
    if b.where("countries", "name", name):
        raise HTTPException(409, "Country already exists.")
    i = b.next_id("countries")
    b.put("countries", i, {"id": i, "name": name})
    audit(u["id"], "country_added", "country", body.name)
    bump()
    return {"ok": True}


@app.post("/api/org/branches", status_code=201)
def add_branch(body: OrgIn, u=Depends(admin), b=Depends(db)):
    if not body.country or not b.where("countries", "name", body.country):
        raise HTTPException(422, "Choose an existing country.")
    name = body.name.strip()
    if any(x["country"] == body.country and x["name"] == name for x in b.all("branches")):
        raise HTTPException(409, "Branch already exists in this country.")
    i = b.next_id("branches")
    b.put("branches", i, {"id": i, "country": body.country, "name": name})
    audit(u["id"], "branch_added", "branch", f"{body.country}/{body.name}")
    bump()
    return {"ok": True}


@app.post("/api/org/departments", status_code=201)
def add_department(body: OrgIn, u=Depends(admin), b=Depends(db)):
    name = body.name.strip()
    if b.where("departments", "name", name):
        raise HTTPException(409, "Department already exists.")
    i = b.next_id("departments")
    b.put("departments", i, {"id": i, "name": name})
    audit(u["id"], "department_added", "department", body.name)
    bump()
    return {"ok": True}


@app.delete("/api/org/{kind}/{oid}")
def delete_org(kind: str, oid: int, u=Depends(admin), b=Depends(db)):
    if kind not in ("countries", "branches", "departments"):
        raise HTTPException(404, "Unknown list")
    r = b.get(kind, oid)
    if not r:
        raise HTTPException(404, "Not found")
    problems = b.all("problems")             # soft-deleted problems count too, as before
    if kind == "countries":
        used = any(p["country"] == r["name"] for p in problems) or any(x["country"] == r["name"] for x in b.all("branches"))
    elif kind == "branches":
        used = any(p["country"] == r["country"] and p["branch"] == r["name"] for p in problems)
    else:
        used = any(p["department"] == r["name"] for p in problems)
    if used:
        raise HTTPException(409, "Still in use by problems or branches. Move or delete those first.")
    b.delete(kind, oid)
    audit(u["id"], f"{kind}_removed", kind, oid, r["name"])
    bump()
    return {"ok": True}


# ------------------------------------------------------------------ frontend compilado (precisa ser a ULTIMA rota)
DIST = os.path.abspath(os.environ.get("GUT_FRONTEND_DIST", os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")))
if os.path.isdir(os.path.join(DIST, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404, "Not found")
        candidate = os.path.abspath(os.path.join(DIST, full_path))
        if full_path and candidate.startswith(DIST + os.sep) and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(DIST, "index.html"), headers={"Cache-Control": "no-cache"})
else:
    @app.get("/", include_in_schema=False)
    def root():
        return JSONResponse({"service": "GUT Matrix API", "status": "ok",
                             "hint": "Frontend nao compilado. Em desenvolvimento use o Vite (npm run dev) em http://localhost:5173."})
