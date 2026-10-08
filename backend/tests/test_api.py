from conftest import make_client

PROBLEM = dict(country="Chile", branch="Santiago", department="Supply Chain", title="Stock-outs of top SKUs",
               description="Top-20 SKUs at zero stock.", evidence="Weekly report", operational_impact="Lost sales",
               consequences="Revenue loss", gravity=4, urgency=4, trend=3, g_just="g", u_just="u", t_just="t")


def test_auth_required_and_csrf(server):
    c = make_client(server)
    assert c.get("/api/problems").status_code == 401
    bare = __import__("fastapi.testclient", fromlist=["TestClient"]).TestClient(server)
    assert bare.post("/api/auth/login", json={"email": "x", "password": "y"}).status_code == 403   # no CSRF header
    assert c.post("/api/auth/login", json={"email": "root@example.com", "password": "wrong"}).status_code == 401


def test_score_priority_and_ranking(users, admin):
    c = users["contributor"]
    r = c.post("/api/problems", json=PROBLEM)
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["gut_score"] == 48 and p["final_score"] == 48 and p["priority"] == "High" and p["status"] == "New"
    r2 = c.post("/api/problems", json={**PROBLEM, "title": "Critical customs delay", "gravity": 5, "urgency": 5, "trend": 4})
    assert r2.json()["priority"] == "Critical" and r2.json()["final_score"] == 100
    items = admin.get("/api/problems?sort=score&dir=desc").json()["items"]
    scores = [i["final_score"] for i in items]
    assert scores == sorted(scores, reverse=True)
    assert admin.post("/api/problems", json={**PROBLEM, "gravity": 6}).status_code == 422


def test_visibility_by_role(users, admin):
    mine = users["contributor"].post("/api/problems", json={**PROBLEM, "title": "Contributor's own problem"}).json()
    # other contributor sees nothing of it; viewer in Chile scope sees it; Paraguay manager does not
    assert users["other_contributor"].get(f"/api/problems/{mine['id']}").status_code == 404
    assert users["viewer"].get(f"/api/problems/{mine['id']}").status_code == 200
    assert users["other_manager"].get(f"/api/problems/{mine['id']}").status_code == 404
    assert users["manager"].get(f"/api/problems/{mine['id']}").status_code == 200
    ids = [i["id"] for i in users["other_contributor"].get("/api/problems").json()["items"]]
    assert mine["id"] not in ids


def test_write_permissions(users):
    c = users["contributor"]
    p = c.post("/api/problems", json={**PROBLEM, "title": "Permissions check"}).json()
    # viewer cannot create / edit / comment
    assert users["viewer"].post("/api/problems", json=PROBLEM).status_code == 403
    assert users["viewer"].patch(f"/api/problems/{p['id']}", json={"version": p["version"], "status": "In Progress"}).status_code == 403
    assert users["viewer"].post(f"/api/problems/{p['id']}/updates", json={"body": "hi"}).status_code == 403
    # manager of another country cannot create in Chile
    assert users["other_manager"].post("/api/problems", json=PROBLEM).status_code == 403
    # creator may edit content but not the plan or validation
    ok = c.patch(f"/api/problems/{p['id']}", json={"version": p["version"], "description": "More detail"})
    assert ok.status_code == 200
    assert c.patch(f"/api/problems/{p['id']}", json={"version": ok.json()["version"], "status": "Completed"}).status_code == 403
    assert c.patch(f"/api/problems/{p['id']}", json={"version": ok.json()["version"], "v_gravity": 5, "v_urgency": 5, "v_trend": 5}).status_code == 403
    # manager can do plan fields but not validation, and cannot delete
    m = users["manager"]
    cur = m.get(f"/api/problems/{p['id']}").json()
    assert m.patch(f"/api/problems/{p['id']}", json={"version": cur["version"], "v_gravity": 5, "v_urgency": 5, "v_trend": 5}).status_code == 403
    assert m.delete(f"/api/problems/{p['id']}").status_code == 403


def test_history_records_every_change(users, admin):
    c = users["contributor"]
    p = c.post("/api/problems", json={**PROBLEM, "title": "History subject", "gravity": 4, "urgency": 3, "trend": 3}).json()
    assert p["priority"] == "High"        # 36
    pid, ver = p["id"], p["version"]
    # contributor raises urgency+trend -> priority High -> Very High; score 36 -> 60
    r = c.patch(f"/api/problems/{pid}", json={"version": ver, "urgency": 5, "trend": 3})
    assert r.status_code == 200 and r.json()["final_score"] == 60 and r.json()["priority"] == "Very High"
    # stale version is rejected
    assert c.patch(f"/api/problems/{pid}", json={"version": ver, "title": "Conflicting edit"}).status_code == 409
    # admin: assign, deadline, status, validate to Critical
    ver = r.json()["version"]
    uid = users["manager_id"]
    r = admin.patch(f"/api/problems/{pid}", json={"version": ver, "responsible_id": uid, "deadline": "2026-12-01",
                                                   "action_plan": "Re-allocate stock", "status": "In Progress",
                                                   "v_gravity": 5, "v_urgency": 5, "v_trend": 4})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["final_score"] == 100 and body["priority"] == "Critical" and body["validated_by_name"] == "Super Admin"
    h = admin.get(f"/api/problems/{pid}/history").json()
    by = {}
    for x in reversed(h):                       # h is newest-first; keep the latest change per field
        if x["kind"] == "change":
            by[x["field"]] = x
    assert by["priority"]["old_value"] == "Very High" and by["priority"]["new_value"] == "Critical"
    assert any(x["field"] == "priority" and x["old_value"] == "High" and x["new_value"] == "Very High" for x in h)
    assert by["responsible_id"]["old_value"] is None and by["responsible_id"]["new_value"] == "Manager"
    assert by["deadline"]["new_value"] == "2026-12-01" and by["status"]["old_value"] == "New"
    assert by["final_score"]["old_value"] == "60" and by["final_score"]["new_value"] == "100"
    assert all(x["user_name"] and x["at"] for x in h)
    assert h[-1]["kind"] == "created"
    # no-op patch creates no history and keeps the version
    n = len(h)
    again = admin.patch(f"/api/problems/{pid}", json={"version": body["version"], "status": "In Progress"})
    assert again.json()["version"] == body["version"]
    assert len(admin.get(f"/api/problems/{pid}/history").json()) == n
    # assigned user (a manager, in scope) can post progress updates; they show in feed + history
    assert users["manager"].post(f"/api/problems/{pid}/updates", json={"body": "Transfer started"}).status_code == 201
    assert admin.get(f"/api/problems/{pid}/updates").json()[0]["body"] == "Transfer started"
    feed = admin.get("/api/updates?since=2000-01-01T00:00:00Z").json()
    assert any(e["problem_id"] == pid and e["field"] == "priority" and e["new_value"] == "Critical" for e in feed)
    assert not any(e["field"] in ("gravity", "urgency", "trend") for e in feed)   # noise hidden from feed
    # completing records completed_at
    cur = admin.get(f"/api/problems/{pid}").json()
    done = admin.patch(f"/api/problems/{pid}", json={"version": cur["version"], "status": "Completed"}).json()
    assert done["completed_at"] and done["open"] is False


def test_validation_all_or_none_and_bad_input(admin, users):
    p = users["contributor"].post("/api/problems", json={**PROBLEM, "title": "Validation rules"}).json()
    r = admin.patch(f"/api/problems/{p['id']}", json={"version": p["version"], "v_gravity": 3})
    assert r.status_code == 422
    r = admin.patch(f"/api/problems/{p['id']}", json={"version": p["version"], "status": "Nonsense"})
    assert r.status_code == 422
    r = admin.patch(f"/api/problems/{p['id']}", json={"version": p["version"], "deadline": "01/12/2026"})
    assert r.status_code == 422
    r = admin.patch(f"/api/problems/{p['id']}", json={"version": p["version"], "responsible_id": 99999})
    assert r.status_code == 422


def test_filters_dashboard_reports(admin, users):
    r = admin.get("/api/problems?country=Chile&priority=Critical").json()
    assert all(i["country"] == "Chile" and i["priority"] == "Critical" for i in r["items"])
    assert admin.get("/api/problems?q=customs").json()["total"] >= 1
    assert admin.get("/api/problems?responsible=none&open=1").status_code == 200
    d = admin.get("/api/dashboard").json()
    k = d["kpis"]
    assert k["open"] >= 1 and k["critical"] >= 1 and 0 < k["avg_score"] <= 125 and len(d["top10"]) <= 10
    assert d["top10"] == sorted(d["top10"], key=lambda x: -x["final_score"])
    # scoped user only sees own scope in the dashboard
    pk = users["other_manager"].get("/api/dashboard").json()["kpis"]
    assert pk["open"] == 0
    assert len(admin.get("/api/reports/trend").json()) == 12
    assert admin.get("/api/reports/summary?group=branch").json()
    assert admin.get("/api/export/problems.csv").text.startswith("\ufeffProblem ID")
    assert users["viewer"].get("/api/export/history.csv").status_code == 403


def test_users_admin_only_and_soft_delete(admin, users):
    assert users["manager"].get("/api/users").status_code == 403
    assert admin.get("/api/users").status_code == 200
    assert admin.post("/api/users", json={"email": "manager@example.com", "name": "dup", "role": "viewer"}).status_code == 409
    assert admin.post("/api/users", json={"email": "bad", "name": "x", "role": "viewer"}).status_code == 422
    p = users["contributor"].post("/api/problems", json={**PROBLEM, "title": "To be deleted"}).json()
    assert admin.delete(f"/api/problems/{p['id']}").status_code == 200
    assert admin.get(f"/api/problems/{p['id']}").status_code == 404
    # deactivated users lose their session at once
    uid = users["other_contributor_id"]
    assert admin.patch(f"/api/users/{uid}", json={"active": False}).status_code == 200
    assert users["other_contributor"].get("/api/meta").status_code == 401
    # admin cannot lock themselves out
    me = admin.get("/api/auth/me").json()
    assert admin.patch(f"/api/users/{me['id']}", json={"active": False}).status_code == 422
    assert any(a["action"] == "problem_deleted" for a in admin.get("/api/audit").json())
