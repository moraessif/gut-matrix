"""GUT scoring rules. Single source of truth for score and priority."""

PRIORITIES = [("Critical", 80), ("Very High", 50), ("High", 30), ("Medium", 15), ("Low", 1)]
PRIORITY_NAMES = [p[0] for p in PRIORITIES]
STATUSES = ["New", "Under Review", "Prioritized", "Action Plan Defined", "In Progress",
            "Waiting for Third Party", "Completed", "Cancelled"]
CLOSED = ("Completed", "Cancelled")
SOURCES = ["Employee observation", "Customer / consultant complaint", "Audit or review",
           "KPI / dashboard alert", "Management review", "Incident or failure", "Other"]
SCALES = {
    "gravity": ["Very low impact", "Low impact", "Moderate impact", "High impact", "Extremely severe impact"],
    "urgency": ["Can wait", "Low urgency", "Should be addressed in the medium term",
                "Must be addressed quickly", "Immediate action required"],
    "trend": ["Unlikely to worsen", "May worsen slowly", "Likely to worsen",
              "Likely to worsen quickly", "Likely to worsen immediately or become critical"],
}


def prio_of(score: int) -> str:
    for name, minimum in PRIORITIES:
        if score >= minimum:
            return name
    return "Low"


def derive(p: dict) -> dict:
    """Recompute every derived field from G/U/T (and validated G/U/T). Mutates and returns p."""
    p["gut_score"] = p["gravity"] * p["urgency"] * p["trend"]
    if p.get("v_gravity") and p.get("v_urgency") and p.get("v_trend"):
        p["v_score"] = p["v_gravity"] * p["v_urgency"] * p["v_trend"]
    else:
        p["v_score"] = None
    p["final_score"] = p["v_score"] if p["v_score"] else p["gut_score"]
    p["priority"] = prio_of(p["final_score"])
    return p
