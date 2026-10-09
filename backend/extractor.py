import os

from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError

MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
MAX_ATTEMPTS = 3

PROMPT = (
    "You extract data from an invoice. Return the invoice fields. Use dates in "
    "YYYY-MM-DD format, a 3-letter currency code (USD if not stated), and give "
    "unit as the price of ONE unit. Use only values visible in the document. "
    "Never invent or correct numbers: copy the document's own total even if it "
    "looks wrong. Use empty string or 0 for anything missing and list those "
    "field names in 'uncertain'."
)


class LineItemOut(BaseModel):
    desc: str
    qty: float
    unit: float


class InvoiceOut(BaseModel):
    vendor: str
    invoice_no: str
    date: str
    currency: str
    lines: list[LineItemOut]
    total: float
    uncertain: list[str]


def _contents(filename: str, content: bytes | None, content_type: str, text: str):
    parts: list = [PROMPT]
    if content:
        name = (filename or "").lower()
        if content_type.startswith("image/"):
            parts.append(types.Part.from_bytes(data=content, mime_type=content_type))
        elif content_type == "application/pdf" or name.endswith(".pdf"):
            parts.append(types.Part.from_bytes(data=content, mime_type="application/pdf"))
        else:
            text = (content.decode("utf-8", errors="ignore") + "\n" + text).strip()
    if text.strip():
        parts.append("Invoice text:\n\n" + text)
    if len(parts) == 1:
        raise ValueError("Provide a file or some invoice text.")
    return parts


def extract_invoice(filename: str, content: bytes | None, content_type: str, text: str) -> InvoiceOut:
    client = genai.Client()  # reads GEMINI_API_KEY from the environment
    contents = _contents(filename, content, content_type or "", text)
    last_error = "no response"
    for _ in range(MAX_ATTEMPTS):
        response = client.models.generate_content(
            model=MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=InvoiceOut,
                temperature=0,
            ),
        )
        try:
            return InvoiceOut.model_validate_json(response.text)
        except (ValidationError, ValueError, TypeError) as e:
            last_error = str(e)
    raise ValueError(f"Could not parse the model's answer after {MAX_ATTEMPTS} tries: {last_error}")
