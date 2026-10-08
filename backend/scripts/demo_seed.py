"""Fill a running instance with demo users and problems (for trying the app).

    python scripts/demo_seed.py http://localhost:8000 admin@example.com 'AdminPassword1'

Creates demo users (password printed), registers sample problems and edits them so
the History / Updates screens have something to show. Not needed in production.
"""
import sys
import os
import httpx

base, email, password = sys.argv[1], sys.argv[2], sys.argv[3]
H = {"X-Requested-With": "gut"}
admin = httpx.Client(base_url=base, headers=H)
assert admin.post("/api/auth/login", json={"email": email, "password": password}).status_code == 200
NEWPW = "DemoPassw0rd!"


def user(key, name, role, **scope):
    r = admin.post("/api/users", json={"email": f"{key}@demo.example.com", "name": name, "role": role, **scope})
    if r.status_code == 409:
        return None
    r.raise_for_status()
    tmp = r.json()["temporary_password"]
    c = httpx.Client(base_url=base, headers=H)
    c.post("/api/auth/login", json={"email": f"{key}@demo.example.com", "password": tmp}).raise_for_status()
    c.post("/api/auth/change-password", json={"current_password": tmp, "new_password": NEWPW}).raise_for_status()
    return c, r.json()["user"]["id"]


def login(key):
    c = httpx.Client(base_url=base, headers=H)
    c.post("/api/auth/login", json={"email": f"{key}@demo.example.com", "password": NEWPW}).raise_for_status()
    return c


made = {k: user(k, n, r, **s) for k, n, r, s in [
    ("carlos", "Carlos Rojas", "manager", dict(scope_country="Chile")),
    ("marta", "Marta Gómez", "manager", dict(scope_country="Paraguay")),
    ("ana", "Ana Souza", "contributor", {}),
    ("diego", "Diego Fuentes", "contributor", {}),
    ("sofia", "Sofia Ramos", "viewer", {})]}
ids = {u["id"]: u["name"] for u in admin.get("/api/users").json()}
uid = {v: k for k, v in ids.items()}
ana, diego, carlos, marta = login("ana"), login("diego"), login("carlos"), login("marta")


def mk(c, geo, title, desc, g, u, t, dept="Supply Chain"):
    r = c.post("/api/problems", json=dict(country=geo[0], branch=geo[1], department=dept, title=title, description=desc,
               evidence="Weekly report and field notes.", operational_impact="Orders delayed and rework.",
               consequences="Revenue loss and customer complaints.", gravity=g, urgency=u, trend=t,
               g_just="Direct effect on revenue.", u_just="Next cargo arrives soon.", t_just="Getting worse each week.",
               suggested_action="Review the process with the team."))
    r.raise_for_status()
    return r.json()


def patch(c, p, **kw):
    r = c.patch(f"/api/problems/{p['id']}", json={"version": p["version"], **kw})
    r.raise_for_status()
    return r.json()


p1 = mk(ana, ("Chile", "Santiago"), "Stock-outs of best-selling SKUs", "14 of the top-20 SKUs are at zero stock in Santiago for 3+ weeks.", 4, 4, 3)
p2 = mk(diego, ("Paraguay", "Ciudad del Este"), "Customs clearance delays on inbound cargo", "Cargo stays 8-12 days at customs versus 3 planned.", 4, 4, 4, "Logistics")
p3 = mk(ana, ("Paraguay", "Concepción"), "Overstock of seasonal items", "Seasonal items cover 7 months of sales.", 3, 3, 3)
p4 = mk(diego, ("Chile", "La Serena"), "Forecast files differ between branches", "Each branch has its own file layout; consolidation is manual.", 3, 3, 4)
p5 = mk(ana, ("Panama", "Panamá"), "Manual invoicing errors", "About 6% of invoices need correction.", 3, 4, 3, "Finance")
p6 = mk(diego, ("Mexico", "Main Branch"), "Slow BI report refresh", "Weekly report takes 25 minutes to refresh.", 2, 2, 2, "IT / Systems")
p7 = mk(ana, ("Portugal", "Main Branch"), "High return rate on one product line", "Returns are 3x the average on the new line.", 4, 3, 5, "Customer Service")
p8 = mk(diego, ("Chile", "Antofagasta"), "Cargo arriving incomplete", "Last 3 cargos arrived with 10-15% of lines missing.", 4, 4, 4, "Logistics")
p9 = mk(ana, ("Uruguay", "Main Branch"), "Slow onboarding of new distributors", "Onboarding takes 5 weeks versus a 2-week target.", 2, 4, 3, "Sales")

# evolution over time
p1 = patch(admin, p1, v_gravity=5, v_urgency=5, v_trend=4, responsible_id=uid["Carlos Rojas"], status="Under Review", deadline="2026-10-30")
p1 = patch(admin, p1, status="In Progress", action_plan="1. Transfer surplus stock from other branches.\n2. Adjust replenishment parameters.\n3. Weekly checkpoint with Supply Chain.")
carlos.post(f"/api/problems/{p1['id']}/updates", json={"body": "First transfer of 1,200 units left Concepción today."}).raise_for_status()
p2 = patch(admin, p2, responsible_id=uid["Marta Gómez"], status="Prioritized", deadline="2026-10-01", action_plan="Pre-clearance documentation checklist and a second customs broker.")
p2 = patch(admin, p2, urgency=5)
p3 = patch(admin, p3, v_gravity=3, v_urgency=3, v_trend=3, status="Action Plan Defined", responsible_id=uid["Marta Gómez"], deadline="2026-12-15", action_plan="Reduce next shipment by 30% for two cycles and run a promotion.")
p5 = patch(admin, p5, status="Under Review")
p6 = patch(admin, p6, v_gravity=2, v_urgency=2, v_trend=2, responsible_id=uid["Sofia Ramos"], status="In Progress", deadline="2026-09-15")
p6 = patch(admin, p6, status="Completed")
p7 = patch(admin, p7, status="Waiting for Third Party", responsible_id=uid["Ana Souza"], deadline="2026-11-15", action_plan="Quality inspection with the supplier.")
p8 = patch(admin, p8, status="In Progress", responsible_id=uid["Diego Fuentes"], deadline="2026-11-30", action_plan="Reconcile packing lists before dispatch; checkpoint at loading.")
diego.post(f"/api/problems/{p8['id']}/updates", json={"body": "Checkpoint added at the Antofagasta loading dock."}).raise_for_status()
p8 = patch(admin, p8, gravity=5)

# spread the timestamps over the last weeks so the Updates screen shows Today / 7 / 30 days.
# This writes straight to the database, so it needs the same credentials as the server
# (FIREBASE_SERVICE_ACCOUNT or FIRESTORE_EMULATOR_HOST); otherwise it is skipped.
if os.environ.get("FIREBASE_SERVICE_ACCOUNT") or os.environ.get("FIRESTORE_EMULATOR_HOST"):
    from datetime import datetime, timedelta, timezone
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from app import store

    def ago(days):
        return (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")

    b = store.backend()
    offsets = {p["id"]: d for p, d in [(p1, 20), (p2, 17), (p3, 14), (p4, 11), (p5, 8), (p6, 27), (p7, 5), (p8, 2), (p9, 0)]}
    for pid, days in offsets.items():
        if not days:
            continue
        hist = sorted(b.where("history", "problem_id", pid), key=lambda h: h["id"])
        # keep the first half of the history at the shifted date and the rest a bit later
        last = ago(days)
        for i, h in enumerate(hist):
            later = max(0, days - i * max(1, days // max(len(hist), 1)))
            last = ago(later)
            b.update("history", h["id"], {"at": last})
        for u_ in b.where("problem_updates", "problem_id", pid):
            b.update("problem_updates", u_["id"], {"created_at": ago(max(0, days // 2))})
        b.update("problems", pid, {"created_at": ago(days), "last_activity_at": last, "updated_at": last})
    b.bump()
else:
    print("Skipping timestamp spreading (set FIREBASE_SERVICE_ACCOUNT or FIRESTORE_EMULATOR_HOST to enable it).")
print("Demo data ready. Demo users: carlos / marta / ana / diego / sofia @demo.example.com, password:", NEWPW)
