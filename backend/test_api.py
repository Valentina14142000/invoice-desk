import pytest
from fastapi.testclient import TestClient

import db
from main import app

INV = {"vendor": "ACME", "invoice_no": "A-1", "date": "2026-09-28",
       "lines": [{"desc": "Toner", "qty": 3, "unit": 45}], "total": 135, "currency": "USD"}
A = {"X-Client-Id": "tester-aaaaaaaa"}
B = {"X-Client-Id": "tester-bbbbbbbb"}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB", tmp_path / "test.db")
    db.init()
    return TestClient(app)


def test_health(client):
    assert client.get("/health").json() == {"ok": True}


def test_bad_total_is_flagged(client):
    assert client.post("/validate", json={**INV, "total": 999}).json()["totals_match"] is False


def test_zero_quantity_rejected(client):
    bad = {**INV, "lines": [{"desc": "x", "qty": 0, "unit": 1}]}
    assert client.post("/validate", json=bad).status_code == 422


def test_requires_client_id(client):
    assert client.get("/invoices").status_code == 400


def test_save_list_delete_and_export(client):
    saved = client.post("/invoices", json=INV, headers=A).json()
    assert saved["status"] == "Accepted"
    assert len(client.get("/invoices", headers=A).json()) == 1
    assert "ACME" in client.get("/invoices/export.csv", headers=A).text
    assert client.delete(f"/invoices/{saved['id']}", headers=A).status_code == 200


def test_visitors_cannot_see_each_other(client):
    saved = client.post("/invoices", json=INV, headers=A).json()
    assert client.get("/invoices", headers=B).json() == []
    assert client.delete(f"/invoices/{saved['id']}", headers=B).status_code == 404
