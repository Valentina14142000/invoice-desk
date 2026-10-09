import pytest
from fastapi.testclient import TestClient

import db
from main import app

INV = {"vendor": "ACME", "invoice_no": "A-1", "date": "2026-09-28",
       "lines": [{"desc": "Toner", "qty": 3, "unit": 45}], "total": 135, "currency": "USD"}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB", tmp_path / "test.db")
    db.init()
    return TestClient(app)


def test_health(client):
    assert client.get("/health").json() == {"ok": True}


def test_bad_total_is_flagged(client):
    r = client.post("/validate", json={**INV, "total": 999})
    assert r.json()["totals_match"] is False


def test_zero_quantity_rejected(client):
    bad = {**INV, "lines": [{"desc": "x", "qty": 0, "unit": 1}]}
    assert client.post("/validate", json=bad).status_code == 422


def test_save_list_delete_and_export(client):
    saved = client.post("/invoices", json=INV).json()
    assert saved["status"] == "Accepted"
    assert len(client.get("/invoices").json()) == 1
    assert "ACME" in client.get("/invoices/export.csv").text
    assert client.delete(f"/invoices/{saved['id']}").status_code == 200
    assert client.get("/invoices").json() == []
