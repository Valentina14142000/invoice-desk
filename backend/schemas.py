from pydantic import BaseModel, Field

class LineItem(BaseModel):
    desc: str
    qty: float = Field(gt=0)
    unit: float = Field(ge=0)

class Invoice(BaseModel):
    vendor: str
    invoice_no: str
    date: str
    lines: list[LineItem]
    total: float
    currency: str = "USD"

    def totals_match(self) -> bool:
        return abs(sum(l.qty * l.unit for l in self.lines) - self.total) < 0.01