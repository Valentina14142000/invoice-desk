"use client";

import { useEffect, useState } from "react";
import {
  Extracted,
  SavedInvoice,
  deleteInvoice,
  exportUrl,
  extractInvoice,
  listInvoices,
  saveInvoice,
} from "@/lib/api";

const SAMPLE = `ACME Supplies Ltd
Invoice #A-1042          Date: 28 September 2026

3 x Toner cartridge @ 45.00
1 x Delivery @ 12.50

Total due: 150.00 USD`;

const box =
  "w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900";
const flag = "border-amber-500 bg-amber-50 dark:bg-amber-950";
const card = "rounded-lg border border-gray-200 p-4 dark:border-gray-700";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [cur, setCur] = useState<Extracted | null>(null);
  const [saved, setSaved] = useState<SavedInvoice[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listInvoices().then(setSaved).catch(() => {});
  }, []);

  const linesSum = cur ? cur.lines.reduce((a, l) => a + l.qty * l.unit, 0) : 0;
  const badQty = !!cur && cur.lines.some((l) => !(l.qty > 0));
  const noLines = !!cur && cur.lines.length === 0;
  const matches = !!cur && !badQty && !noLines && Math.abs(linesSum - cur.total) < 0.01;

  function patch(p: Partial<Extracted>) {
    if (cur) setCur({ ...cur, ...p });
  }
  function patchLine(i: number, p: Partial<Extracted["lines"][number]>) {
    if (cur) setCur({ ...cur, lines: cur.lines.map((l, k) => (k === i ? { ...l, ...p } : l)) });
  }
  const u = (k: string) => (cur?.uncertain.includes(k) ? flag : "");

  async function onExtract() {
    setError(null);
    setBusy(true);
    try {
      if (!file && !text.trim()) throw new Error("Choose a file or paste some invoice text first.");
      setCur(await extractInvoice(file, text));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (!cur) return;
    setError(null);
    try {
      const { uncertain, ...inv } = cur;
      void uncertain;
      await saveInvoice(inv);
      setSaved(await listInvoices());
      setCur(null);
      setFile(null);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function onDelete(id: number) {
    await deleteInvoice(id);
    setSaved(await listInvoices());
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Invoice Desk</h1>
        <p className="text-sm text-gray-500">
          Upload an invoice, review what was extracted, and check that the totals add up.
        </p>
      </header>

      <section className={`${card} space-y-3`}>
        <h2 className="font-medium">1. Add an invoice</h2>
        <input
          type="file"
          accept="image/*,application/pdf,text/plain"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <textarea
          className={`${box} min-h-24`}
          placeholder="Or paste the invoice text here"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onExtract}
            disabled={busy}
            className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {busy ? "Reading document..." : "Extract with Gemini"}
          </button>
          <button
            onClick={() => {
              setText(SAMPLE);
              setFile(null);
            }}
            className="rounded border border-gray-300 px-4 py-2 text-sm dark:border-gray-600"
          >
            Load sample invoice
          </button>
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded bg-red-100 p-3 text-sm text-red-900">
          {error}
        </p>
      )}

      {cur && (
        <section className={`${card} space-y-4`}>
          <h2 className="font-medium">2. Review and correct</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            {(["vendor", "invoice_no", "date", "currency"] as const).map((k) => (
              <label key={k} className="text-sm">
                {k.replace("_", " ")}
                <input
                  className={`${box} ${u(k)}`}
                  value={cur[k]}
                  onChange={(e) => patch({ [k]: e.target.value })}
                />
              </label>
            ))}
          </div>

          <div className="space-y-2 overflow-x-auto">
            {cur.lines.map((l, i) => (
              <div key={i} className="grid min-w-[440px] grid-cols-[1fr_5rem_6rem_5rem_2rem] items-center gap-2">
                <input className={box} value={l.desc} aria-label="Description"
                  onChange={(e) => patchLine(i, { desc: e.target.value })} />
                <input className={box} type="number" step="any" value={l.qty} aria-label="Quantity"
                  onChange={(e) => patchLine(i, { qty: Number(e.target.value) })} />
                <input className={box} type="number" step="any" value={l.unit} aria-label="Unit price"
                  onChange={(e) => patchLine(i, { unit: Number(e.target.value) })} />
                <span className="text-right text-sm">{(l.qty * l.unit).toFixed(2)}</span>
                <button aria-label="Remove line"
                  onClick={() => setCur({ ...cur, lines: cur.lines.filter((_, k) => k !== i) })}>
                  ×
                </button>
              </div>
            ))}
            <button
              className="text-sm underline"
              onClick={() => setCur({ ...cur, lines: [...cur.lines, { desc: "", qty: 1, unit: 0 }] })}
            >
              + Add line
            </button>
          </div>

          <div className="grid max-w-md gap-3 sm:grid-cols-2">
            <div className="text-sm">
              Line items sum
              <div className="py-1.5 font-semibold">{linesSum.toFixed(2)} {cur.currency}</div>
            </div>
            <label className="text-sm">
              Total on document
              <input className={`${box} ${u("total")}`} type="number" step="any" value={cur.total}
                onChange={(e) => patch({ total: Number(e.target.value) })} />
            </label>
          </div>

          <p
            role="status"
            className={`rounded p-3 text-sm font-medium ${
              matches ? "bg-emerald-100 text-emerald-900" : noLines || badQty ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"
            }`}
          >
            {noLines
              ? "No line items. Add at least one."
              : badQty
                ? "Every line needs a quantity greater than 0."
                : matches
                  ? "Totals match. This invoice can be accepted."
                  : `Needs review: lines sum to ${linesSum.toFixed(2)} but the document total is ${cur.total.toFixed(2)}.`}
          </p>

          <button
            onClick={onSave}
            disabled={noLines || badQty}
            className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            Save invoice
          </button>
        </section>
      )}

      <section className={`${card} space-y-3`}>
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Saved invoices</h2>
          {saved.length > 0 && (
            <a href={exportUrl} className="text-sm underline">Export CSV</a>
          )}
        </div>
        {saved.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing saved yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr><th>Vendor</th><th>No.</th><th>Date</th><th>Total</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {saved.map((r) => (
                  <tr key={r.id} className="border-t border-gray-200 dark:border-gray-700">
                    <td className="py-1.5">{r.vendor}</td>
                    <td>{r.invoice_no}</td>
                    <td>{r.date}</td>
                    <td>{r.total.toFixed(2)} {r.currency}</td>
                    <td>{r.status}</td>
                    <td><button className="underline" onClick={() => onDelete(r.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
