"use client";

import { useState } from "react";
import {
  Invoice,
  LineItem,
  ValidationResult,
  UploadResult,
  validateInvoice,
  uploadDocument,
} from "@/lib/api";

const sample: Invoice = {
  vendor: "ACME Supplies Ltd",
  invoice_no: "A-1042",
  date: "2026-09-28",
  lines: [
    { desc: "Toner cartridge", qty: 3, unit: 45 },
    { desc: "Delivery", qty: 1, unit: 12.5 },
  ],
  total: 150,
  currency: "USD",
};

const field =
  "w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900";

export default function Home() {
  const [invoice, setInvoice] = useState<Invoice>(sample);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const linesSum = invoice.lines.reduce((a, l) => a + l.qty * l.unit, 0);

  function setLine(i: number, patch: Partial<LineItem>) {
    setInvoice({
      ...invoice,
      lines: invoice.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    });
  }

  async function onValidate() {
    setBusy(true);
    setError(null);
    try {
      setResult(await validateInvoice(invoice));
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setUpload(await uploadDocument(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Invoice Desk</h1>
        <p className="text-sm text-gray-500">
          Review an invoice and check that its line items add up to the total.
        </p>
      </header>

      <section className="space-y-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <h2 className="font-medium">Invoice details</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Vendor
            <input className={field} value={invoice.vendor}
              onChange={(e) => setInvoice({ ...invoice, vendor: e.target.value })} />
          </label>
          <label className="text-sm">
            Invoice number
            <input className={field} value={invoice.invoice_no}
              onChange={(e) => setInvoice({ ...invoice, invoice_no: e.target.value })} />
          </label>
          <label className="text-sm">
            Date
            <input className={field} value={invoice.date}
              onChange={(e) => setInvoice({ ...invoice, date: e.target.value })} />
          </label>
          <label className="text-sm">
            Currency
            <input className={field} value={invoice.currency}
              onChange={(e) => setInvoice({ ...invoice, currency: e.target.value })} />
          </label>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Line items</h3>
          {invoice.lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_6rem] gap-2">
              <input className={field} value={l.desc} aria-label="Description"
                onChange={(e) => setLine(i, { desc: e.target.value })} />
              <input className={field} type="number" value={l.qty} aria-label="Quantity"
                onChange={(e) => setLine(i, { qty: Number(e.target.value) })} />
              <input className={field} type="number" value={l.unit} aria-label="Unit price"
                onChange={(e) => setLine(i, { unit: Number(e.target.value) })} />
            </div>
          ))}
          <p className="text-sm text-gray-500">Line items sum to {linesSum.toFixed(2)}</p>
        </div>

        <label className="block text-sm">
          Total on document
          <input className={field} type="number" value={invoice.total}
            onChange={(e) => setInvoice({ ...invoice, total: Number(e.target.value) })} />
        </label>

        <button
          onClick={onValidate}
          disabled={busy}
          className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {busy ? "Checking..." : "Check invoice"}
        </button>

        {result && (
          <p
            role="status"
            className={`rounded p-3 text-sm ${
              result.totals_match
                ? "bg-emerald-100 text-emerald-900"
                : "bg-amber-100 text-amber-900"
            }`}
          >
            {result.totals_match
              ? "Totals match. This invoice can be accepted."
              : `Totals do not match: line items sum to ${linesSum.toFixed(2)} but the document says ${invoice.total}. Send to review.`}
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <h2 className="font-medium">Upload a document</h2>
        <input type="file" accept="application/pdf,image/*"
          onChange={(e) => onUpload(e.target.files?.[0])} />
        {upload && (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Received {upload.filename} ({upload.bytes.toLocaleString()} bytes). Extraction comes next.
          </p>
        )}
      </section>

      {error && (
        <p role="alert" className="rounded bg-red-100 p-3 text-sm text-red-900">{error}</p>
      )}
    </main>
  );
}
