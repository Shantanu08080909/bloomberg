"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Database, Download, Loader2, Play, Upload } from "lucide-react";
import { Badge, buttonClass, Callout, Field, inputClass } from "@/components/ui";
import { apiFetch, downloadFile } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import type { DatasetDef } from "@/lib/services/datasets";

interface Result {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pages: number;
  sourceIds: string[];
}

export function DataExplorerClient({
  datasets,
  catalog,
  series,
  sourceId,
  exportable,
}: {
  datasets: DatasetDef[];
  catalog: Record<string, { count: number; latest: string | null }>;
  series: { id: string; name: string; sourceId: string }[];
  sourceId: string;
  exportable: Record<string, boolean>;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(datasets[0]!.id);
  const [params, setParams] = useState({ symbol: "", series: "", from: "", to: "", type: "" });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imp, setImp] = useState({ seriesId: "", name: "", country: "India", category: "inflation", unit: "%", frequency: "monthly", sourceNote: "", csv: "" });
  const [impMsg, setImpMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const def = datasets.find((d) => d.id === active)!;
  const shown = datasets.filter((d) => !q || `${d.name} ${d.description}`.toLowerCase().includes(q.toLowerCase()));

  const query = () => {
    const out: Record<string, string | number> = { dataset: active, page, pageSize: 100 };
    for (const f of def.filters) if (params[f]) out[f] = params[f];
    return out;
  };

  async function run(p = page) {
    setLoading(true);
    setError(null);
    try {
      setResult(await apiFetch<Result>("/api/data/query", { body: { ...query(), page: p } }));
      setPage(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const exportCsv = () => {
    const qs = new URLSearchParams(Object.entries(query()).map(([k, v]) => [k, String(v)]));
    downloadFile(`/api/data/export?${qs}`, `${active}.csv`).catch((e: Error) => setError(e.message));
  };

  async function importCsv(e: React.FormEvent) {
    e.preventDefault();
    setImpMsg(null);
    try {
      const r = await apiFetch<{ imported: number; seriesId: string }>("/api/data/import", { body: imp });
      setImpMsg({ ok: true, text: `Imported ${r.imported} observations into ${r.seriesId}. It now appears on the Economic Dashboard with source USER.` });
    } catch (err) {
      setImpMsg({ ok: false, text: (err as Error).message });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-panel border border-line bg-panel">
          <div className="border-b border-line p-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search datasets" aria-label="Search datasets" className={cn(inputClass, "h-7")} />
          </div>
          <ul className="p-1.5" role="listbox" aria-label="Datasets">
            {shown.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active === d.id}
                  onClick={() => {
                    setActive(d.id);
                    setResult(null);
                    setPage(1);
                    setError(null);
                  }}
                  className={cn("flex w-full items-start gap-2 rounded px-2 py-1.5 text-left", active === d.id ? "bg-raised" : "hover:bg-panel-2")}
                >
                  <Database className="mt-0.5 size-3.5 shrink-0 text-faint" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] text-fg">{d.name}</span>
                    <span className="num block text-[10.5px] text-faint">
                      {(catalog[d.id]?.count ?? 0).toLocaleString("en-IN")} records{catalog[d.id]?.latest ? ` · latest ${String(catalog[d.id]!.latest).slice(0, 10)}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="flex min-w-0 flex-col gap-3">
          <div className="rounded-panel border border-line bg-panel p-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[14px] font-semibold">{def.name}</h2>
              <Badge tone={sourceId === "demo" ? "demo" : "info"}>source: {sourceId}</Badge>
              {exportable[sourceId] ? <Badge tone="up">export permitted</Badge> : <Badge tone="down">export not permitted</Badge>}
              {def.maxRange ? <Badge>{def.maxRange}</Badge> : null}
            </div>
            <p className="mt-1 text-[12px] text-muted">{def.description}</p>
            <details className="mt-2">
              <summary className="cursor-pointer text-[11.5px] text-accent">Schema ({def.columns.length} columns)</summary>
              <table className="data-table mt-2">
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Type</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {def.columns.map((c) => (
                    <tr key={c.name}>
                      <td className="num text-fg">{c.name}</td>
                      <td className="num text-muted">{c.type}</td>
                      <td className="whitespace-normal text-dim">{c.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
            <form
              className="mt-3 flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(1);
              }}
            >
              {def.filters.includes("symbol") ? (
                <Field label={active === "instruments" ? "Symbol contains" : "Symbol"} htmlFor="dq-symbol">
                  <input id="dq-symbol" value={params.symbol} onChange={(e) => setParams({ ...params, symbol: e.target.value.toUpperCase() })} className={cn(inputClass, "h-7 w-36")} placeholder="e.g. KVRBANK" />
                </Field>
              ) : null}
              {def.filters.includes("series") ? (
                <Field label="Series" htmlFor="dq-series">
                  <select id="dq-series" value={params.series} onChange={(e) => setParams({ ...params, series: e.target.value })} className={cn(inputClass, "h-7 w-64")}>
                    <option value="">Choose…</option>
                    {series.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.sourceId})
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              {def.filters.includes("type") ? (
                <Field label="Type" htmlFor="dq-type">
                  <input id="dq-type" value={params.type} onChange={(e) => setParams({ ...params, type: e.target.value })} className={cn(inputClass, "h-7 w-28")} placeholder={active === "instruments" ? "EQUITY" : "DIVIDEND"} />
                </Field>
              ) : null}
              {def.filters.includes("from") ? (
                <>
                  <Field label="From" htmlFor="dq-from">
                    <input id="dq-from" type="date" value={params.from} onChange={(e) => setParams({ ...params, from: e.target.value })} className={cn(inputClass, "h-7 w-40")} />
                  </Field>
                  <Field label="To" htmlFor="dq-to">
                    <input id="dq-to" type="date" value={params.to} onChange={(e) => setParams({ ...params, to: e.target.value })} className={cn(inputClass, "h-7 w-40")} />
                  </Field>
                </>
              ) : null}
              <button type="submit" className={buttonClass("primary", "sm")} disabled={loading}>
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Run query
              </button>
              <button type="button" className={buttonClass("default", "sm")} onClick={exportCsv} disabled={!result}>
                <Download className="size-3.5" /> Export CSV
              </button>
            </form>
          </div>

          {error ? <Callout tone="error">{error}</Callout> : null}

          {result ? (
            <div className="rounded-panel border border-line bg-panel">
              <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-[11.5px] text-muted">
                <span className="num">{result.total.toLocaleString("en-IN")} matching records</span>
                {result.sourceIds.map((sid) => (
                  <Badge key={sid} tone={sid === "demo" ? "demo" : "info"}>
                    {sid}
                  </Badge>
                ))}
                <span className="ml-auto">Exports are capped at 10,000 rows per request.</span>
              </div>
              <div className="max-h-[520px] overflow-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      {result.columns.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r, i) => (
                      <tr key={i}>
                        {result.columns.map((c) => (
                          <td key={c} className={cn(typeof r[c] === "number" && "r num")}>
                            {r[c] == null ? <span className="text-faint">null</span> : String(r[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.rows.length === 0 ? <p className="px-3 py-8 text-center text-[12px] text-muted">No records match.</p> : null}
              </div>
              {result.pages > 1 ? (
                <div className="flex items-center justify-end gap-2 border-t border-line px-3 py-1.5 text-[11.5px] text-muted">
                  <button type="button" className="rounded p-1 hover:bg-raised disabled:opacity-30" disabled={page <= 1 || loading} onClick={() => run(page - 1)} aria-label="Previous page">
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <span className="num">
                    Page {result.page} of {result.pages}
                  </span>
                  <button type="button" className="rounded p-1 hover:bg-raised disabled:opacity-30" disabled={page >= result.pages || loading} onClick={() => run(page + 1)} aria-label="Next page">
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <section className="rounded-panel border border-line bg-panel">
        <h2 className="flex items-center gap-2 border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">
          <Upload className="size-3.5" aria-hidden /> Import an economic series from CSV
        </h2>
        <form onSubmit={importCsv} className="grid gap-3 p-3 md:grid-cols-4">
          <Field label="Series ID" htmlFor="im-id" hint="A–Z, 0–9, underscore">
            <input id="im-id" required value={imp.seriesId} onChange={(e) => setImp({ ...imp, seriesId: e.target.value.toUpperCase() })} className={inputClass} placeholder="RBI_REPO_OFFICIAL" />
          </Field>
          <Field label="Name" htmlFor="im-name">
            <input id="im-name" required value={imp.name} onChange={(e) => setImp({ ...imp, name: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Country" htmlFor="im-country">
            <input id="im-country" required value={imp.country} onChange={(e) => setImp({ ...imp, country: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Unit" htmlFor="im-unit">
            <input id="im-unit" required value={imp.unit} onChange={(e) => setImp({ ...imp, unit: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Category" htmlFor="im-cat">
            <select id="im-cat" value={imp.category} onChange={(e) => setImp({ ...imp, category: e.target.value })} className={inputClass}>
              {["rates", "inflation", "growth", "fx", "yields", "production", "labour"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Frequency" htmlFor="im-freq">
            <select id="im-freq" value={imp.frequency} onChange={(e) => setImp({ ...imp, frequency: e.target.value })} className={inputClass}>
              <option>daily</option>
              <option>monthly</option>
              <option>quarterly</option>
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Where did this data come from?" htmlFor="im-src">
              <input id="im-src" required value={imp.sourceNote} onChange={(e) => setImp({ ...imp, sourceNote: e.target.value })} className={inputClass} placeholder="e.g. RBI DBIE download, 2026-10-01" />
            </Field>
          </div>
          <div className="md:col-span-4">
            <Field label="CSV with columns date,value (YYYY-MM-DD)" htmlFor="im-csv">
              <textarea id="im-csv" required rows={5} value={imp.csv} onChange={(e) => setImp({ ...imp, csv: e.target.value })} className="w-full rounded border border-line-strong bg-bg p-2 font-mono text-[12px] text-fg focus:border-accent focus:outline-none" placeholder={"date,value\n2026-01-01,5.25\n2026-02-01,5.25"} />
            </Field>
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="Load CSV from file"
              className="mt-1 text-[11.5px] text-muted file:mr-2 file:rounded file:border file:border-line-strong file:bg-panel-2 file:px-2 file:py-1 file:text-dim"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 1_000_000) return setImpMsg({ ok: false, text: "File is larger than 1 MB" });
                setImp((x) => ({ ...x, csv: "" }));
                const text = await f.text();
                setImp((x) => ({ ...x, csv: text }));
              }}
            />
          </div>
          <div className="flex items-center gap-3 md:col-span-4">
            <button type="submit" className={buttonClass("primary")}>
              Import series
            </button>
            {impMsg ? <span className={cn("text-[12px]", impMsg.ok ? "text-up" : "text-down")}>{impMsg.text}</span> : null}
          </div>
          <p className="text-[10.5px] text-faint md:col-span-4">
            Imported data is stored as source USER. You are responsible for its accuracy and for having the right to use it. Imports cannot overwrite series owned by a provider.
          </p>
        </form>
      </section>
    </div>
  );
}
