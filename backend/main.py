import csv
import io
import os
import time
from collections import defaultdict, deque

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

import db  # noqa: E402
from extractor import extract_invoice  # noqa: E402
from schemas import Invoice  # noqa: E402

ALLOWED = [
    o.strip().rstrip("/")
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if o.strip()
]
MAX_BYTES = 8 * 1024 * 1024
MAX_TEXT = 50_000
RATE_LIMIT = int(os.getenv("EXTRACT_PER_HOUR", "10"))
_hits: dict[str, deque] = defaultdict(deque)

app = FastAPI(title="Invoice Desk")
db.init()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED,
    allow_origin_regex=r"https://invoice-desk[a-z0-9-]*\.vercel\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)


def owner_id(x_client_id: str = Header(default="")) -> str:
    cid = x_client_id.strip()
    if not (8 <= len(cid) <= 64) or not cid.replace("-", "").isalnum():
        raise HTTPException(400, "Missing or invalid X-Client-Id header")
    return cid


def rate_limit(request: Request):
    fwd = request.headers.get("x-forwarded-for", "")
    ip = fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown")
    now = time.time()
    q = _hits[ip]
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) >= RATE_LIMIT:
        raise HTTPException(429, f"Limit reached: {RATE_LIMIT} extractions per hour. Please try again later.")
    q.append(now)


@app.get("/")
def root():
    return {"app": "Invoice Desk API", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/validate")
def validate(invoice: Invoice):
    return {"valid": True, "totals_match": invoice.totals_match()}


@app.post("/extract")
def extract(
    request: Request,
    file: UploadFile | None = File(None),
    text: str = Form(""),
    owner: str = Depends(owner_id),
):
    rate_limit(request)
    if len(text) > MAX_TEXT:
        raise HTTPException(413, "Pasted text is too long.")
    content = file.file.read(MAX_BYTES + 1) if file else None
    if content is not None and len(content) > MAX_BYTES:
        raise HTTPException(413, "File is too large (limit 8 MB).")
    try:
        return extract_invoice(
            file.filename if file else "", content,
            file.content_type if file else "", text,
        )
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(502, f"Extraction failed: {e}")


@app.get("/invoices")
def list_invoices(owner: str = Depends(owner_id)):
    return db.all_rows(owner)


@app.post("/invoices")
def save_invoice(invoice: Invoice, owner: str = Depends(owner_id)):
    status = "Accepted" if invoice.totals_match() else "Needs review"
    return db.add(owner, invoice.model_dump(), status)


@app.delete("/invoices/{invoice_id}")
def delete_invoice(invoice_id: int, owner: str = Depends(owner_id)):
    if not db.remove(owner, invoice_id):
        raise HTTPException(404, "Invoice not found")
    return {"deleted": invoice_id}


@app.get("/invoices/export.csv")
def export_csv(owner: str = Depends(owner_id)):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["vendor", "invoice_no", "date", "currency", "description", "qty",
                "unit", "line_total", "invoice_total", "status"])
    for r in db.all_rows(owner):
        for l in r["lines"]:
            w.writerow([r["vendor"], r["invoice_no"], r["date"], r["currency"], l["desc"],
                        l["qty"], l["unit"], round(l["qty"] * l["unit"], 2), r["total"], r["status"]])
    return Response(
        buf.getvalue(), media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="invoices.csv"'},
    )
