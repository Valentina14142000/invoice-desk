import io
import os

from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError
from pypdf import PdfReader

from schemas import Invoice

MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
MAX_ATTEMPTS = 3

PROMPT = (
    "Extract the invoice fields from the text below. Use dates in YYYY-MM-DD "
    "format. Use only values that appear in the document; never invent line "
    "items or totals. If the currency is not stated, use USD."
)


# Plain schema for the model. Business rules (qty > 0 etc.) are enforced
# afterwards by the stricter Invoice model.
class LineItemOut(BaseModel):
    desc: str
    qty: float
    unit: float


class InvoiceOut(BaseModel):
    vendor: str
    invoice_no: str
    date: str
    lines: list[LineItemOut]
    total: float
    currency: str


def text_from_file(filename: str, content: bytes) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        reader = PdfReader(io.BytesIO(content))
        return "\n".join((page.extract_text() or "") for page in reader.pages).strip()
    return content.decode("utf-8", errors="ignore").strip()


def extract_invoice(text: str) -> Invoice:
    client = genai.Client()  # reads GEMINI_API_KEY from the environment
    prompt = f"{PROMPT}\n\nInvoice text:\n\n{text}"
    last_error = "no response"

    for _ in range(MAX_ATTEMPTS):
        response = client.models.generate_content(
            model=MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=InvoiceOut,
                temperature=0,
            ),
        )
        try:
            return Invoice.model_validate_json(response.text)
        except (ValidationError, ValueError, TypeError) as e:
            last_error = str(e)
            prompt = (
                f"{PROMPT}\n\nInvoice text:\n\n{text}\n\n"
                f"Your previous answer was rejected: {last_error}\n"
                "Return corrected JSON."
            )

    raise ValueError(f"Extraction failed after {MAX_ATTEMPTS} attempts: {last_error}")
