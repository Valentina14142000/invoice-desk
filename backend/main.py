from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from schemas import Invoice

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
