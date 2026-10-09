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
export type Extracted = Invoice & { uncertain: string[] };
export type SavedInvoice = Invoice & { id: number; status: string; created_at: number };

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
      else if (Array.isArray(body.detail))
        msg = body.detail
          .map((d: { loc: (string | number)[]; msg: string }) => `${d.loc.slice(1).join(".")}: ${d.msg}`)
          .join("; ");
    } catch {
      // keep the default message
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function extractInvoice(file: File | null, text: string): Promise<Extracted> {
  const form = new FormData();
  if (file) form.append("file", file);
  if (text.trim()) form.append("text", text);
  return parse<Extracted>(await fetch(`${BASE}/extract`, { method: "POST", body: form }));
}

export async function listInvoices(): Promise<SavedInvoice[]> {
  return parse<SavedInvoice[]>(await fetch(`${BASE}/invoices`));
}

export async function saveInvoice(inv: Invoice): Promise<SavedInvoice> {
  return parse<SavedInvoice>(
    await fetch(`${BASE}/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inv),
    }),
  );
}

export async function deleteInvoice(id: number): Promise<void> {
  await parse(await fetch(`${BASE}/invoices/${id}`, { method: "DELETE" }));
}

export const exportUrl = `${BASE}/invoices/export.csv`;
