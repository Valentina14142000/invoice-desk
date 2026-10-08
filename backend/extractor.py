import io
import os

from anthropic import Anthropic
from pydantic import ValidationError
from pypdf import PdfReader

from schemas import Invoice

MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5")
MAX_ATTEMPTS = 3

SYSTEM = (
    "You extract structured data from invoices. Call the record_invoice tool "
    "exactly once. Use dates in YYYY-MM-DD format. Use only values that appear "
    "in the document; never invent line items or totals."
)


def text_from_file(filename: str, content: bytes) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        reader = PdfReader(io.BytesIO(content))
        return "\n".join((page.extract_text() or "") for page in reader.pages).strip()
    return content.decode("utf-8", errors="ignore").strip()


def extract_invoice(text: str) -> Invoice:
    client = Anthropic()  # reads ANTHROPIC_API_KEY from the environment
    tool = {
        "name": "record_invoice",
        "description": "Record the structured fields of one invoice.",
        "input_schema": Invoice.model_json_schema(),
    }
    messages = [{"role": "user", "content": f"Invoice text:\n\n{text}"}]
    last_error = "no tool call returned"

    for _ in range(MAX_ATTEMPTS):
        response = client.messages.create(
            model=MODEL,
            max_tokens=1500,
            system=SYSTEM,
            tools=[tool],
            tool_choice={"type": "tool", "name": "record_invoice"},
            messages=messages,
        )
        block = next((b for b in response.content if b.type == "tool_use"), None)
        if block is None:
            continue
        try:
            return Invoice.model_validate(block.input)
        except ValidationError as e:
            last_error = str(e)
            messages.append({"role": "assistant", "content": response.content})
            messages.append({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "is_error": True,
                    "content": f"Validation failed, fix and call the tool again: {e}",
                }],
            })

    raise ValueError(f"Extraction failed after {MAX_ATTEMPTS} attempts: {last_error}")
