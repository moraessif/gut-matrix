import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["GUT_STORE"] = "memory"      # in-memory fake of the Firestore layer
os.environ["SUPERADMIN_EMAIL"] = "root@example.com"
os.environ["SUPERADMIN_PASSWORD"] = "RootPass12345"
os.chdir(os.path.dirname(os.path.dirname(__file__)))

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def server():
    from app.main import app
    with TestClient(app) as c:      # runs lifespan (creates reference data + super admin)
        yield app


def make_client(app):
    c = TestClient(app)
    c.headers.update({"X-Requested-With": "gut"})
    return c


@pytest.fixture(scope="session")
def admin(server):
    c = make_client(server)
    r = c.post("/api/auth/login", json={"email": "root@example.com", "password": "RootPass12345"})
    assert r.status_code == 200, r.text
    return c


@pytest.fixture(scope="session")
def users(server, admin):
    """One logged-in client per role."""
    spec = {
        "manager": dict(role="manager", scope_country="Chile"),
        "other_manager": dict(role="manager", scope_country="Paraguay"),
        "contributor": dict(role="contributor"),
        "other_contributor": dict(role="contributor"),
        "viewer": dict(role="viewer", scope_country="Chile"),
    }
    out = {}
    for key, extra in spec.items():
        r = admin.post("/api/users", json={"email": f"{key}@example.com", "name": key.replace("_", " ").title(), **extra})
        assert r.status_code == 201, r.text
        temp = r.json()["temporary_password"]
        c = make_client(server)
        assert c.post("/api/auth/login", json={"email": f"{key}@example.com", "password": temp}).status_code == 200
        assert c.get("/api/meta").status_code == 403          # must change password first
        assert c.post("/api/auth/change-password", json={"current_password": temp, "new_password": "NewPassw0rd!x"}).status_code == 200
        out[key] = c
        out[key + "_id"] = r.json()["user"]["id"]
    return out
