from fastapi import FastAPI, UploadFile
from schemas import Invoice

app = FastAPI(title="Invoice Desk")

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