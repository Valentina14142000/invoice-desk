import csv
import io

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

import db  # noqa: E402
from extractor import extract_invoice  # noqa: E402
from schemas import Invoice  # noqa: E402

app = FastAPI(title="Invoice Desk")
db.init()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/validate")
def validate(invoice: Invoice):
    return {"valid": True, "totals_match": invoice.totals_match()}


@app.post("/extract")
def extract(file: UploadFile | None = File(None), text: str = Form("")):
    content = file.file.read() if file else None
    try:
        out = extract_invoice(
            file.filename if file else "", content,
            file.content_type if file else "", text,
        )
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:  # network, quota, bad key, etc.
        raise HTTPException(502, f"Extraction failed: {e}")
    return out


@app.get("/invoices")
def list_invoices():
    return db.all_rows()


@app.post("/invoices")
def save_invoice(invoice: Invoice):
    status = "Accepted" if invoice.totals_match() else "Needs review"
    return db.add(invoice.model_dump(), status)


@app.delete("/invoices/{invoice_id}")
def delete_invoice(invoice_id: int):
    if not db.remove(invoice_id):
        raise HTTPException(404, "Invoice not found")
    return {"deleted": invoice_id}


@app.get("/invoices/export.csv")
def export_csv():
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["vendor", "invoice_no", "date", "currency", "description", "qty",
                "unit", "line_total", "invoice_total", "status"])
    for r in db.all_rows():
        for l in r["lines"]:
            w.writerow([r["vendor"], r["invoice_no"], r["date"], r["currency"], l["desc"],
                        l["qty"], l["unit"], round(l["qty"] * l["unit"], 2), r["total"], r["status"]])
    return Response(
        buf.getvalue(), media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="invoices.csv"'},
    )
