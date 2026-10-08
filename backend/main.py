from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from extractor import extract_invoice, text_from_file  # noqa: E402
from schemas import Invoice  # noqa: E402

app = FastAPI(title="Invoice Desk")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/documents")
async def upload(file: UploadFile):
    content = await file.read()
    return {"filename": file.filename, "bytes": len(content)}


@app.post("/validate")
def validate(invoice: Invoice):
    return {"valid": True, "totals_match": invoice.totals_match()}


@app.post("/extract")
def extract(file: UploadFile):
    content = file.file.read()
    text = text_from_file(file.filename, content)
    if not text:
        raise HTTPException(
            422,
            "No text found in this file. Scanned documents need OCR, which is not built yet.",
        )
    try:
        invoice = extract_invoice(text)
    except Exception as e:  # surface the reason to the UI
        raise HTTPException(502, f"Extraction failed: {e}")
    return {"invoice": invoice, "totals_match": invoice.totals_match()}
