"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Download, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { Badge, buttonClass, Callout, inputClass, StatusBadge } from "@/components/ui";
import { apiFetch, downloadFile } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { formatIST } from "@/lib/dates";
import { securityHref } from "@/lib/dto";
import { SCREEN_FIELDS, type NumericField, type ScreenConfig, type ScreenFilter, type ScreenRow } from "@/lib/finance/screener";
import { fmtCompact, fmtCrore, fmtMultiple, fmtNumber, fmtPct, fmtPrice } from "@/lib/format";
import type { DisplayStatus } from "@/lib/market/types";

interface Result {
  total: number;
  universe: number;
  page: number;
  pages: number;
  rows: ScreenRow[];
  coverage: Record<NumericField, number>;
  asOf: string | null;
  statuses: string[];
}

interface Saved {
  id: number;
  name: string;
  config: Partial<ScreenConfig>;
}

const DEFAULT_COLUMNS: NumericField[] = ["price", "changePct", "marketCapCr", "pe", "pb", "roe", "dividendYield", "rsi14"];

const DEFAULT_CONFIG: ScreenConfig = {
  exchanges: ["NSE"],
  types: [],
  sectors: [],
  filters: [],
  logic: "AND",
  sortBy: "marketCapCr",
  sortDir: "desc",
  page: 1,
  pageSize: 25,
  columns: DEFAULT_COLUMNS,
};

const FIELD = Object.fromEntries(SCREEN_FIELDS.map((f) => [f.key, f])) as Record<NumericField, (typeof SCREEN_FIELDS)[number]>;

function formatField(key: NumericField, v: number | null) {
  switch (key) {
    case "marketCapCr":
      return fmtCrore(v);
    case "volume":
      return fmtCompact(v);
    case "pe":
    case "pb":
      return fmtMultiple(v);
    case "debtToEquity":
      return fmtMultiple(v, 2);
    case "changePct":
    case "priceVsSma50":
    case "priceVsSma200":
    case "revenueGrowth":
    case "profitGrowth":
      return fmtPct(v);
    case "roe":
    case "dividendYield":
    case "volatility30":
      return fmtPct(v, 2, false);
    case "rsi14":
      return fmtNumber(v, 1);
    default:
      return fmtPrice(v);
  }
}

const OPS: { value: ScreenFilter["op"]; label: string }[] = [
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "between", label: "between" },
];

export function ScreenerClient({ sectors, initialSaved }: { sectors: string[]; initialSaved: Saved[] }) {
  const [config, setConfig] = useState<ScreenConfig>(DEFAULT_CONFIG);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved[]>(initialSaved);
  const [saveName, setSaveName] = useState("");
  const [showCols, setShowCols] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = useCallback(async (c: ScreenConfig) => {
    setLoading(true);
    setError(null);
    try {
      setResult(await apiFetch<Result>("/api/screener", { body: c }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void run(config), 250);
    return () => clearTimeout(t);
  }, [config, run]);

  const update = (patch: Partial<ScreenConfig>) => setConfig((c) => ({ ...c, page: 1, ...patch }));
  const setFilter = (i: number, f: ScreenFilter) => update({ filters: config.filters.map((x, k) => (k === i ? f : x)) });
  const columns = config.columns?.length ? config.columns : DEFAULT_COLUMNS;
  const coverage = result?.coverage;

  const addFilter = () => {
    const field = SCREEN_FIELDS.find((f) => (coverage?.[f.key] ?? 1) > 0 && !config.filters.some((x) => x.field === f.key))?.key ?? "pe";
    update({ filters: [...config.filters, { field, op: "lt", value: 25 }] });
  };

  const toggleSort = (key: string) => {
    setConfig((c) => ({ ...c, sortBy: key, sortDir: c.sortBy === key && c.sortDir === "desc" ? "asc" : "desc" }));
  };

  async function saveScreen() {
    if (!saveName.trim()) return;
    try {
      const { screener } = await apiFetch<{ screener: Saved }>("/api/screeners", { body: { name: saveName.trim(), config } });
      setSaved((s) => [...s.filter((x) => x.name !== screener.name), screener].sort((a, b) => a.name.localeCompare(b.name)));
      setMessage(`Saved “${screener.name}”`);
      setSaveName("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteSaved(id: number) {
    try {
      await apiFetch(`/api/screeners/${id}`, { method: "DELETE" });
      setSaved((s) => s.filter((x) => x.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const exportCsv = () =>
    downloadFile(`/api/screener/export?config=${encodeURIComponent(JSON.stringify({ ...config, page: 1 }))}`, "screener.csv").catch((e: Error) => setError(e.message));

  const disabledFields = useMemo(() => new Set(SCREEN_FIELDS.filter((f) => coverage && coverage[f.key] === 0).map((f) => f.key)), [coverage]);

  return (
    <div className="grid gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-3">
        <section className="rounded-panel border border-line bg-panel p-3">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">Universe</h2>
          <fieldset className="mb-2">
            <legend className="mb-1 text-[11px] text-muted">Exchange</legend>
            <div className="flex gap-3">
              {(["NSE", "BSE"] as const).map((x) => (
                <label key={x} className="flex items-center gap-1.5 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={config.exchanges.includes(x)}
                    onChange={(e) => update({ exchanges: e.target.checked ? [...config.exchanges, x] : config.exchanges.filter((y) => y !== x) })}
                    className="accent-[var(--color-accent)]"
                  />
                  {x}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="mb-2">
            <legend className="mb-1 text-[11px] text-muted">Security type</legend>
            <div className="flex gap-3">
              {(["EQUITY", "ETF"] as const).map((x) => (
                <label key={x} className="flex items-center gap-1.5 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={config.types.includes(x)}
                    onChange={(e) => update({ types: e.target.checked ? [...config.types, x] : config.types.filter((y) => y !== x) })}
                    className="accent-[var(--color-accent)]"
                  />
                  {x === "EQUITY" ? "Equity" : "ETF"}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="mb-1 block text-[11px] text-muted" htmlFor="sector-select">
            Sectors {config.sectors.length ? `(${config.sectors.length})` : "(all)"}
          </label>
          <select
            id="sector-select"
            multiple
            value={config.sectors}
            onChange={(e) => update({ sectors: [...e.target.selectedOptions].map((o) => o.value) })}
            className="h-28 w-full rounded border border-line-strong bg-bg px-1 py-1 text-[12px]"
          >
            {sectors.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <p className="mt-1 text-[10.5px] text-faint">Ctrl/⌘-click to select several.</p>
        </section>

        <section className="rounded-panel border border-line bg-panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">Filters</h2>
            <div role="radiogroup" aria-label="Combine filters with" className="inline-flex rounded border border-line bg-bg p-0.5">
              {(["AND", "OR"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={config.logic === l}
                  onClick={() => update({ logic: l })}
                  className={cn("h-5 rounded-[3px] px-2 text-[10.5px] font-semibold", config.logic === l ? "bg-raised text-fg" : "text-muted")}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <ul className="flex flex-col gap-2">
            {config.filters.map((f, i) => (
              <li key={i} className="rounded border border-line bg-panel-2 p-2">
                <div className="flex items-center gap-1.5">
                  <select
                    aria-label="Field"
                    value={f.field}
                    onChange={(e) => setFilter(i, { ...f, field: e.target.value as NumericField })}
                    className="h-7 min-w-0 flex-1 rounded border border-line-strong bg-bg px-1.5 text-[12px]"
                  >
                    {(["Price", "Fundamentals", "Technical"] as const).map((g) => (
                      <optgroup key={g} label={g}>
                        {SCREEN_FIELDS.filter((x) => x.group === g).map((x) => (
                          <option key={x.key} value={x.key} disabled={disabledFields.has(x.key)}>
                            {x.label}
                            {disabledFields.has(x.key) ? " (no data)" : ""}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <button type="button" aria-label="Remove filter" onClick={() => update({ filters: config.filters.filter((_, k) => k !== i) })} className="rounded p-1 text-muted hover:text-down">
                    <X className="size-3.5" />
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <select
                    aria-label="Operator"
                    value={f.op}
                    onChange={(e) => {
                      const op = e.target.value as ScreenFilter["op"];
                      setFilter(i, op === "between" ? { field: f.field, op, value: f.value, value2: f.value * 2 || 10 } : { field: f.field, op, value: f.value });
                    }}
                    className="h-7 w-24 rounded border border-line-strong bg-bg px-1.5 text-[12px]"
                  >
                    {OPS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Value"
                    type="number"
                    step="any"
                    value={Number.isFinite(f.value) ? f.value : ""}
                    onChange={(e) => setFilter(i, { ...f, value: Number(e.target.value) })}
                    className={cn(inputClass, "h-7 min-w-0 flex-1")}
                  />
                  {f.op === "between" ? (
                    <input
                      aria-label="Upper value"
                      type="number"
                      step="any"
                      value={Number.isFinite(f.value2) ? f.value2 : ""}
                      onChange={(e) => setFilter(i, { ...f, value2: Number(e.target.value) })}
                      className={cn(inputClass, "h-7 min-w-0 flex-1")}
                    />
                  ) : null}
                  <span className="w-8 text-[10.5px] text-faint">{FIELD[f.field].unit}</span>
                </div>
                {coverage ? (
                  <p className="mt-1 text-[10.5px] text-faint">Coverage {(coverage[f.field] * 100).toFixed(0)}% — rows without a value never match.</p>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={addFilter} className={buttonClass("default", "sm")}>
              <Plus className="size-3.5" aria-hidden /> Add filter
            </button>
            <button type="button" onClick={() => setConfig({ ...DEFAULT_CONFIG })} className={buttonClass("ghost", "sm")}>
              Clear all
            </button>
          </div>
        </section>

        <section className="rounded-panel border border-line bg-panel p-3">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">Saved screens</h2>
          {saved.length ? (
            <ul className="mb-2 flex flex-col gap-1">
              {saved.map((s) => (
                <li key={s.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left text-[12.5px] text-dim hover:bg-raised hover:text-fg"
                    onClick={() => setConfig({ ...DEFAULT_CONFIG, ...s.config, page: 1 } as ScreenConfig)}
                  >
                    {s.name}
                  </button>
                  <button type="button" aria-label={`Delete ${s.name}`} onClick={() => deleteSaved(s.id)} className="rounded p-1 text-faint hover:text-down">
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-2 text-[12px] text-muted">No saved screens yet.</p>
          )}
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void saveScreen();
            }}
          >
            <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Name this screen" className={cn(inputClass, "h-7")} maxLength={80} aria-label="Screen name" />
            <button type="submit" className={buttonClass("primary", "sm")} disabled={!saveName.trim()}>
              <Save className="size-3.5" aria-hidden /> Save
            </button>
          </form>
          {message ? <p className="mt-1 text-[11px] text-up">{message}</p> : null}
        </section>
      </aside>

      <section className="flex min-w-0 flex-col rounded-panel border border-line bg-panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <span className="text-[12.5px]">
            {result ? (
              <>
                <span className="num font-semibold text-fg">{result.total}</span> <span className="text-muted">of {result.universe} match</span>
              </>
            ) : (
              <span className="text-muted">Running…</span>
            )}
          </span>
          {loading ? <Loader2 className="size-3.5 animate-spin text-muted" aria-label="Loading" /> : null}
          {result?.statuses.map((s) => <StatusBadge key={s} status={s as DisplayStatus} />)}
          {result?.asOf ? <span className="text-[11px] text-faint">data as of {formatIST(result.asOf)} IST</span> : null}
          <div className="relative ml-auto flex items-center gap-2">
            <button type="button" className={buttonClass("default", "sm")} onClick={() => setShowCols((s) => !s)} aria-expanded={showCols}>
              <Columns3 className="size-3.5" aria-hidden /> Columns
            </button>
            <button type="button" className={buttonClass("default", "sm")} onClick={exportCsv}>
              <Download className="size-3.5" aria-hidden /> CSV
            </button>
            {showCols ? (
              <div className="absolute right-0 top-8 z-20 grid w-72 grid-cols-2 gap-1 rounded-md border border-line-strong bg-panel p-2 shadow-xl">
                {SCREEN_FIELDS.map((f) => (
                  <label key={f.key} className="flex items-center gap-1.5 text-[12px] text-dim">
                    <input
                      type="checkbox"
                      checked={columns.includes(f.key)}
                      onChange={(e) => update({ columns: e.target.checked ? [...columns, f.key] : columns.filter((c) => c !== f.key) })}
                      className="accent-[var(--color-accent)]"
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {error ? (
          <div className="p-3">
            <Callout tone="error">{error}</Callout>
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="data-table">
            <caption className="sr-only">Screener results</caption>
            <thead>
              <tr>
                {[{ key: "symbol", label: "Symbol", right: false }, { key: "name", label: "Name", right: false }, ...columns.map((c) => ({ key: c, label: FIELD[c].label, right: true }))].map((c) => (
                  <th key={c.key} className={c.right ? "r" : undefined} aria-sort={config.sortBy === c.key ? (config.sortDir === "asc" ? "ascending" : "descending") : undefined}>
                    <button type="button" onClick={() => toggleSort(c.key)} className={cn("inline-flex items-center gap-1 uppercase hover:text-fg", c.right && "flex-row-reverse")}>
                      {c.label}
                      {config.sortBy === c.key ? config.sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
                    </button>
                  </th>
                ))}
                <th>Sector</th>
              </tr>
            </thead>
            <tbody>
              {result?.rows.map((r) => (
                <tr key={r.instrumentId}>
                  <td>
                    <Link href={securityHref(r.exchange, r.symbol)} className="num font-semibold text-accent-strong hover:underline">
                      {r.symbol}
                    </Link>{" "}
                    <span className="text-[10px] text-faint">{r.exchange}</span>
                  </td>
                  <td className="max-w-[220px] truncate text-dim">{r.name}</td>
                  {columns.map((c) => (
                    <td key={c} className={cn("r num", (c === "changePct" || c === "priceVsSma50" || c === "priceVsSma200") && ((r[c] ?? 0) > 0 ? "text-up" : (r[c] ?? 0) < 0 ? "text-down" : ""))}>
                      {r[c] == null ? <span className="text-faint" title="Data unavailable">—</span> : formatField(c, r[c] as number)}
                    </td>
                  ))}
                  <td className="text-muted">{r.sector ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result && result.rows.length === 0 ? (
            <div className="px-3 py-10 text-center text-[12.5px] text-muted">
              No securities match these filters.{" "}
              <button type="button" className="text-accent hover:underline" onClick={() => setConfig({ ...DEFAULT_CONFIG })}>
                Clear filters
              </button>
            </div>
          ) : null}
        </div>
        {result && result.pages > 1 ? (
          <div className="flex items-center justify-end gap-2 border-t border-line px-3 py-1.5 text-[11.5px] text-muted">
            <label className="mr-auto flex items-center gap-1.5">
              Rows
              <select value={config.pageSize} onChange={(e) => update({ pageSize: Number(e.target.value) })} className="h-6 rounded border border-line bg-bg px-1 text-[11.5px]">
                {[25, 50, 100].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <button type="button" className="rounded p-1 hover:bg-raised disabled:opacity-30" disabled={result.page <= 1} onClick={() => setConfig((c) => ({ ...c, page: result.page - 1 }))} aria-label="Previous page">
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="num">
              Page {result.page} of {result.pages}
            </span>
            <button type="button" className="rounded p-1 hover:bg-raised disabled:opacity-30" disabled={result.page >= result.pages} onClick={() => setConfig((c) => ({ ...c, page: result.page + 1 }))} aria-label="Next page">
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        ) : null}
        <div className="border-t border-line px-3 py-1.5 text-[10.5px] text-faint">
          Technical fields (SMA, RSI, volatility) are computed on the server from stored daily closes. Fundamentals come from the active source only; missing values are shown as — and are{" "}
          <Badge>never zero-filled</Badge>.
        </div>
      </section>
    </div>
  );
}
