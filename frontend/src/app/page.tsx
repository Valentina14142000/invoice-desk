"use client";

import { useEffect, useRef, useState } from "react";
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

const input =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
const unsure =
  "!border-amber-500 !bg-amber-50 dark:!bg-amber-950/40";
const card =
  "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800/60";
const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/50 disabled:cursor-not-allowed disabled:opacity-50";
const btnGhost =
  "inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700";

function money(n: number, code: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code || "USD" }).format(n);
  } catch {
    return `${n.toFixed(2)} ${code}`;
  }
}

function Badge({ status }: { status: string }) {
  const ok = status === "Accepted";
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        ok
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
          : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
      }`}
    >
      {status}
    </span>
  );
}

function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
          done || active ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-500 dark:bg-slate-700"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <span className={`text-sm ${active ? "font-semibold" : "text-slate-500"}`}>{label}</span>
    </li>
  );
}

export default function Home() {
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [cur, setCur] = useState<Extracted | null>(null);
  const [saved, setSaved] = useState<SavedInvoice[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listInvoices().then(setSaved).catch(() => {});
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const linesSum = cur ? cur.lines.reduce((a, l) => a + l.qty * l.unit, 0) : 0;
  const noLines = !!cur && cur.lines.length === 0;
  const badQty = !!cur && cur.lines.some((l) => !(l.qty > 0));
  const matches = !!cur && !noLines && !badQty && Math.abs(linesSum - cur.total) < 0.01;
  const diff = cur ? cur.total - linesSum : 0;
  const u = (k: string) => (cur?.uncertain.includes(k) ? unsure : "");

  const stats = {
    count: saved.length,
    accepted: saved.filter((s) => s.status === "Accepted").length,
    review: saved.filter((s) => s.status !== "Accepted").length,
  };

  function patch(p: Partial<Extracted>) {
    if (cur) setCur({ ...cur, ...p });
  }
  function patchLine(i: number, p: Partial<Extracted["lines"][number]>) {
    if (cur) setCur({ ...cur, lines: cur.lines.map((l, k) => (k === i ? { ...l, ...p } : l)) });
  }

  function pickFile(f: File | null) {
    setFile(f);
    if (f) setText("");
  }

  function reset() {
    setCur(null);
    setFile(null);
    setText("");
    setPreviewText("");
    setError(null);
  }

  async function onExtract() {
    setError(null);
    const useFile = mode === "upload" ? file : null;
    const useText = mode === "paste" ? text : "";
    if (!useFile && !useText.trim()) {
      setError(mode === "upload" ? "Choose or drop an invoice file first." : "Paste some invoice text first.");
      return;
    }
    setBusy(true);
    try {
      setCur(await extractInvoice(useFile, useText));
      setPreviewText(useText);
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
      const row = await saveInvoice(inv);
      setSaved(await listInvoices());
      setToast(row.status === "Accepted" ? "Saved and accepted" : "Saved and marked for review");
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function onDelete(r: SavedInvoice) {
    if (!window.confirm(`Delete invoice ${r.invoice_no || ""} from ${r.vendor || "this vendor"}?`)) return;
    await deleteInvoice(r.id);
    setSaved(await listInvoices());
    setToast("Invoice deleted");
  }

  const isImage = !!file && file.type.startsWith("image/");
  const isPdf = !!file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Invoice Desk</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Upload an invoice, check what was extracted, and make sure the totals add up.
            </p>
          </div>
          <ol className="flex items-center gap-5" aria-label="Progress">
            <Step n={1} label="Add" active={!cur} done={!!cur} />
            <Step n={2} label="Review" active={!!cur} done={false} />
            <Step n={3} label="Save" active={false} done={false} />
          </ol>
        </header>

        {error && (
          <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss error" className="font-bold">×</button>
          </div>
        )}

        {!cur && (
          <section className={card} aria-labelledby="add-h">
            <h2 id="add-h" className="mb-3 text-lg font-semibold">Add an invoice</h2>
            <div role="tablist" className="mb-4 inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-700">
              {(["upload", "paste"] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                    mode === m ? "bg-white shadow dark:bg-slate-900" : "text-slate-500"
                  }`}
                >
                  {m === "upload" ? "Upload file" : "Paste text"}
                </button>
              ))}
            </div>

            {mode === "upload" ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files[0] ?? null); }}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center ${
                  dragging ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-300 dark:border-slate-600"
                }`}
              >
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf,text/plain"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(0)} KB</p>
                    <button onClick={() => pickFile(null)} className="text-sm underline">Remove</button>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Drop an invoice here</p>
                    <p className="text-xs text-slate-500">PDF, photo, screenshot or text file</p>
                    <button onClick={() => fileRef.current?.click()} className={btnGhost}>Choose file</button>
                  </>
                )}
              </div>
            ) : (
              <textarea
                className={`${input} min-h-40`}
                placeholder="Paste the invoice text here"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button onClick={onExtract} disabled={busy} className={btnPrimary}>
                {busy && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                )}
                {busy ? "Reading document..." : "Extract with Gemini"}
              </button>
              <button
                onClick={() => { setMode("paste"); setText(SAMPLE); setFile(null); }}
                className={btnGhost}
              >
                Try the sample invoice
              </button>
              {busy && <span className="text-sm text-slate-500">This can take up to 20 seconds when the model is busy.</span>}
            </div>
          </section>
        )}

        {cur && (
          <section className="grid gap-5 lg:grid-cols-5" aria-labelledby="rev-h">
            <div className={`${card} lg:col-span-2`}>
              <h2 className="mb-3 text-lg font-semibold">Original document</h2>
              {isImage && previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Uploaded invoice" className="max-h-[32rem] w-full rounded-lg border border-slate-200 object-contain dark:border-slate-700" />
              )}
              {isPdf && previewUrl && (
                <iframe src={previewUrl} title="Invoice PDF" className="h-[32rem] w-full rounded-lg border border-slate-200 dark:border-slate-700" />
              )}
              {!isImage && !isPdf && (
                <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-900">
                  {previewText || "Text file"}
                </pre>
              )}
            </div>

            <div className={`${card} space-y-5 lg:col-span-3`}>
              <div className="flex items-center justify-between">
                <h2 id="rev-h" className="text-lg font-semibold">Review and correct</h2>
                <button onClick={reset} className="text-sm underline">Start over</button>
              </div>
              {cur.uncertain.length > 0 && (
                <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  Fields outlined in amber are ones Gemini was unsure about. Please check them against the document.
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  ["vendor", "Vendor"],
                  ["invoice_no", "Invoice number"],
                  ["date", "Date"],
                  ["currency", "Currency"],
                ] as const).map(([k, label]) => (
                  <label key={k} className="text-sm font-medium">
                    {label}
                    <input
                      className={`${input} mt-1 font-normal ${u(k)}`}
                      value={cur[k]}
                      onChange={(e) => patch({ [k]: e.target.value })}
                    />
                  </label>
                ))}
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[460px] space-y-2">
                  <div className="grid grid-cols-[1fr_4.5rem_6rem_6rem_2rem] gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span>Description</span><span>Qty</span><span>Unit price</span><span className="text-right">Line total</span><span />
                  </div>
                  {cur.lines.map((l, i) => (
                    <div key={i} className="grid grid-cols-[1fr_4.5rem_6rem_6rem_2rem] items-center gap-2">
                      <input className={input} value={l.desc} aria-label={`Description, line ${i + 1}`}
                        onChange={(e) => patchLine(i, { desc: e.target.value })} />
                      <input className={`${input} ${l.qty > 0 ? "" : "!border-red-500"}`} type="number" step="any" min="0"
                        value={l.qty} aria-label={`Quantity, line ${i + 1}`}
                        onChange={(e) => patchLine(i, { qty: Number(e.target.value) })} />
                      <input className={input} type="number" step="any" min="0" value={l.unit}
                        aria-label={`Unit price, line ${i + 1}`}
                        onChange={(e) => patchLine(i, { unit: Number(e.target.value) })} />
                      <span className="text-right text-sm tabular-nums">{money(l.qty * l.unit, cur.currency)}</span>
                      <button aria-label={`Remove line ${i + 1}`} className="text-lg text-slate-400 hover:text-red-600"
                        onClick={() => setCur({ ...cur, lines: cur.lines.filter((_, k) => k !== i) })}>×</button>
                    </div>
                  ))}
                  <button className="text-sm font-medium text-emerald-700 underline dark:text-emerald-400"
                    onClick={() => setCur({ ...cur, lines: [...cur.lines, { desc: "", qty: 1, unit: 0 }] })}>
                    + Add line
                  </button>
                </div>
              </div>

              <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 dark:bg-slate-900/60">
                <div className="text-sm">
                  <div className="text-slate-500">Line items add up to</div>
                  <div className="text-lg font-semibold tabular-nums">{money(linesSum, cur.currency)}</div>
                </div>
                <label className="text-sm font-medium">
                  Total on the document
                  <input className={`${input} mt-1 font-normal ${u("total")}`} type="number" step="any"
                    value={cur.total} onChange={(e) => patch({ total: Number(e.target.value) })} />
                </label>
              </div>

              <div
                role="status"
                className={`rounded-lg border p-3 text-sm font-medium ${
                  matches
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                    : noLines || badQty
                      ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                      : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                }`}
              >
                {noLines
                  ? "No line items yet. Add at least one."
                  : badQty
                    ? "Every line needs a quantity greater than 0."
                    : matches
                      ? "Totals match. This invoice can be accepted."
                      : `Needs review: the document total is ${money(Math.abs(diff), cur.currency)} ${diff > 0 ? "higher" : "lower"} than the line items.`}
              </div>

              <div className="flex flex-wrap gap-3">
                <button onClick={onSave} disabled={noLines || badQty} className={btnPrimary}>
                  {matches ? "Save as accepted" : "Save for review"}
                </button>
                <button onClick={reset} className={btnGhost}>Discard</button>
              </div>
            </div>
          </section>
        )}

        <section className={card} aria-labelledby="saved-h">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="saved-h" className="text-lg font-semibold">Saved invoices</h2>
            {saved.length > 0 && (
              <a href={exportUrl} className={btnGhost}>Export CSV</a>
            )}
          </div>

          {saved.length > 0 && (
            <dl className="mb-4 grid grid-cols-3 gap-3 text-center">
              {[
                ["Total", stats.count],
                ["Accepted", stats.accepted],
                ["Needs review", stats.review],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900/60">
                  <dt className="text-xs text-slate-500">{k}</dt>
                  <dd className="text-xl font-bold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          )}

          {saved.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-600">
              No invoices saved yet. Add one above and it will show up here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Vendor</th><th className="pr-3">No.</th><th className="pr-3">Date</th>
                    <th className="pr-3 text-right">Total</th><th className="pr-3">Status</th><th />
                  </tr>
                </thead>
                <tbody>
                  {saved.map((r) => (
                    <tr key={r.id} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="py-2.5 pr-3 font-medium">{r.vendor}</td>
                      <td className="pr-3">{r.invoice_no}</td>
                      <td className="pr-3">{r.date}</td>
                      <td className="pr-3 text-right tabular-nums">{money(r.total, r.currency)}</td>
                      <td className="pr-3"><Badge status={r.status} /></td>
                      <td className="text-right">
                        <button onClick={() => onDelete(r)} className="text-sm text-slate-500 underline hover:text-red-600">
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg dark:bg-white dark:text-slate-900">
          {toast}
        </div>
      )}
    </div>
  );
}
