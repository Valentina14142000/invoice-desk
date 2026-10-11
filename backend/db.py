import json
import sqlite3
import time
from contextlib import closing
from pathlib import Path

DB = Path(__file__).parent / "invoices.db"


def _conn():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c


def init():
    with closing(_conn()) as c, c:
        c.execute(
            """CREATE TABLE IF NOT EXISTS invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner TEXT NOT NULL,
                vendor TEXT, invoice_no TEXT, date TEXT, currency TEXT,
                total REAL, status TEXT, lines TEXT, created_at REAL)"""
        )


def _row(r):
    d = dict(r)
    d["lines"] = json.loads(d["lines"])
    d.pop("owner", None)
    return d


def add(owner: str, inv: dict, status: str) -> dict:
    with closing(_conn()) as c, c:
        cur = c.execute(
            "INSERT INTO invoices (owner, vendor, invoice_no, date, currency, total, status, lines, created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (owner, inv["vendor"], inv["invoice_no"], inv["date"], inv["currency"], inv["total"],
             status, json.dumps(inv["lines"]), time.time()),
        )
        row = c.execute("SELECT * FROM invoices WHERE id=?", (cur.lastrowid,)).fetchone()
    return _row(row)


def all_rows(owner: str) -> list[dict]:
    with closing(_conn()) as c:
        rows = c.execute("SELECT * FROM invoices WHERE owner=? ORDER BY id DESC", (owner,))
        return [_row(r) for r in rows]


def remove(owner: str, invoice_id: int) -> bool:
    with closing(_conn()) as c, c:
        return c.execute(
            "DELETE FROM invoices WHERE id=? AND owner=?", (invoice_id, owner)
        ).rowcount > 0
