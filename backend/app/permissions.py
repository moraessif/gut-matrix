"""Role rules. Every read and write in main.py goes through these functions."""

CONTENT_FIELDS = {"title", "description", "evidence", "operational_impact", "consequences", "source", "process",
                  "impacted_area", "suggested_action", "country", "branch", "department",
                  "gravity", "urgency", "trend", "g_just", "u_just", "t_just"}
PLAN_FIELDS = {"responsible_id", "action_plan", "planned_start", "deadline", "status"}
VALIDATION_FIELDS = {"v_gravity", "v_urgency", "v_trend"}
CLOSED = ("Completed", "Cancelled")
ROLES = ("super_admin", "manager", "contributor", "viewer")


def _scope_pairs(user):
    return [(col, user[key]) for col, key in
            (("country", "scope_country"), ("branch", "scope_branch"), ("department", "scope_department")) if user[key]]


def in_scope(user, p) -> bool:
    return all(p[c] == v for c, v in _scope_pairs(user))


def can_view(user, p) -> bool:
    """Python equivalent of the old visible_sql(): may this user see problem p?"""
    r = user["role"]
    if r == "super_admin":
        return True
    if r in ("manager", "viewer"):
        return in_scope(user, p)
    return p["created_by"] == user["id"] or p["responsible_id"] == user["id"] or \
        (bool(_scope_pairs(user)) and in_scope(user, p))


def can_create(user, country, branch, department) -> bool:
    if user["role"] == "viewer":
        return False
    return in_scope(user, {"country": country, "branch": branch, "department": department})


def editable_fields(user, p) -> set:
    r = user["role"]
    if r == "super_admin":
        return CONTENT_FIELDS | PLAN_FIELDS | VALIDATION_FIELDS
    if not can_view(user, p):
        return set()
    if r == "manager":
        return set(CONTENT_FIELDS | PLAN_FIELDS)
    if r == "contributor":
        f = set()
        if p["created_by"] == user["id"] and p["status"] not in CLOSED:
            f |= CONTENT_FIELDS
        if p["responsible_id"] == user["id"]:
            f |= {"action_plan", "status"}
        return f
    return set()


def can_add_update(user, p) -> bool:
    r = user["role"]
    if r == "super_admin":
        return True
    if r == "manager":
        return in_scope(user, p)
    if r == "contributor":
        return p["created_by"] == user["id"] or p["responsible_id"] == user["id"]
    return False
