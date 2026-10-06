const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export type LineItem = { desc: string; qty: number; unit: number };

export type Invoice = {
  vendor: string;
  invoice_no: string;
  date: string;
  lines: LineItem[];
  total: number;
  currency: string;
};

export type ValidationResult = { valid: boolean; totals_match: boolean };
export type UploadResult = { filename: string; bytes: number };

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (Array.isArray(body.detail)) {
        msg = body.detail
          .map((d: { loc: (string | number)[]; msg: string }) =>
            `${d.loc.slice(1).join(".")}: ${d.msg}`)
          .join("; ");
      }
    } catch {
      // keep the default message
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function validateInvoice(invoice: Invoice): Promise<ValidationResult> {
  const res = await fetch(`${BASE}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(invoice),
  });
  return parse<ValidationResult>(res);
}

export async function uploadDocument(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/documents`, { method: "POST", body: form });
  return parse<UploadResult>(res);
}
