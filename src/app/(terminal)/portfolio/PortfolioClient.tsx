"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { EChart, axisStyle } from "@/components/charts/EChart";
import { SegButton } from "@/components/InstrumentChart";
import { InstrumentPicker, type PickedInstrument } from "@/components/InstrumentPicker";
import { Badge, buttonClass, Callout, Change, EmptyState, Field, inputClass, Stat, StatusBadge } from "@/components/ui";
import { apiFetch, downloadFile, useApi } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { formatISTDate } from "@/lib/dates";
import { securityHref } from "@/lib/dto";
import { fmtINR, fmtNumber, fmtPrice, fmtRatioPct } from "@/lib/format";
import type { DisplayStatus } from "@/lib/market/types";
import type { PortfolioSummaryDTO } from "@/lib/server/portfolio-dto";

interface P {
  id: number;
  name: string;
  benchmarkInstrumentId: number | null;
}
type Tx = PortfolioSummaryDTO["transactions"][number];
type TxType = "BUY" | "SELL" | "DIVIDEND" | "SPLIT";

interface History {
  points: { date: string; value: number; netFlow: number; twrIndex: number }[];
  benchmark: { date: string; index: number }[];
  note: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);

function TxForm({
  portfolioId,
  editing,
  onDone,
  onCancel,
}: {
  portfolioId: number;
  editing: Tx | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [inst, setInst] = useState<PickedInstrument | null>(editing ? { id: editing.instrumentId, symbol: editing.symbol, exchange: editing.exchange, name: editing.name } : null);
  const [type, setType] = useState<TxType>((editing?.type as TxType) ?? "BUY");
  const [date, setDate] = useState(editing?.tradeDate ?? today());
  const [qty, setQty] = useState(editing ? String(editing.quantity) : "");
  const [price, setPrice] = useState(editing ? String(editing.price) : "");
  const [fees, setFees] = useState(editing ? String(editing.fees) : "0");
  const [amount, setAmount] = useState(editing?.amount != null ? String(editing.amount) : "");
  const [ratio, setRatio] = useState(editing?.splitRatio != null ? String(editing.splitRatio) : "2");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!inst) {
      setError("Choose a security");
      return;
    }
    setBusy(true);
    setError(null);
    const body = {
      instrumentId: inst.id,
      type,
      tradeDate: date,
      quantity: type === "BUY" || type === "SELL" ? Number(qty) : 0,
      price: type === "BUY" || type === "SELL" ? Number(price) : 0,
      fees: Number(fees || 0),
      amount: type === "DIVIDEND" ? Number(amount) : null,
      splitRatio: type === "SPLIT" ? Number(ratio) : null,
      notes: notes || null,
    };
    try {
      if (editing) await apiFetch(`/api/transactions/${editing.id}`, { method: "PATCH", body });
      else await apiFetch(`/api/portfolios/${portfolioId}/transactions`, { body });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const trade = type === "BUY" || type === "SELL";
  return (
    <form onSubmit={submit} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4" aria-label={editing ? "Edit transaction" : "Add transaction"}>
      <div className="sm:col-span-2">
        <Field label="Security">
          <InstrumentPicker value={inst} onChange={setInst} types={["EQUITY", "ETF"]} />
        </Field>
      </div>
      <Field label="Type" htmlFor="tx-type">
        <select id="tx-type" value={type} onChange={(e) => setType(e.target.value as TxType)} className={inputClass}>
          <option value="BUY">Buy</option>
          <option value="SELL">Sell</option>
          <option value="DIVIDEND">Dividend received</option>
          <option value="SPLIT">Split / bonus</option>
        </select>
      </Field>
      <Field label="Trade date" htmlFor="tx-date">
        <input id="tx-date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className={inputClass} required />
      </Field>
      {trade ? (
        <>
          <Field label="Quantity" htmlFor="tx-qty">
            <input id="tx-qty" type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className={inputClass} required />
          </Field>
          <Field label="Price per share (₹)" htmlFor="tx-price">
            <input id="tx-price" type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} required />
          </Field>
        </>
      ) : type === "DIVIDEND" ? (
        <Field label="Total amount received (₹)" htmlFor="tx-amount">
          <input id="tx-amount" type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} required />
        </Field>
      ) : (
        <Field label="New shares per old share" htmlFor="tx-ratio" hint="e.g. 2 for a 1:2 split, 2 for a 1:1 bonus">
          <input id="tx-ratio" type="number" min="0" step="any" value={ratio} onChange={(e) => setRatio(e.target.value)} className={inputClass} required />
        </Field>
      )}
      <Field label="Fees & charges (₹)" htmlFor="tx-fees" hint="Brokerage, STT, stamp duty, GST — added to cost / deducted from proceeds">
        <input id="tx-fees" type="number" min="0" step="any" value={fees} onChange={(e) => setFees(e.target.value)} className={inputClass} />
      </Field>
      <div className={trade ? "" : "sm:col-span-2"}>
        <Field label="Notes" htmlFor="tx-notes">
          <input id="tx-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} maxLength={500} />
        </Field>
      </div>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
        <button type="submit" className={buttonClass("primary")} disabled={busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {editing ? "Save changes" : "Add transaction"}
        </button>
        <button type="button" className={buttonClass("ghost")} onClick={onCancel}>
          Cancel
        </button>
        {error ? (
          <p role="alert" className="text-[12px] text-down">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function PortfolioClient({ initial, benchmarks }: { initial: P[]; benchmarks: { id: number; name: string }[] }) {
  const [portfolios, setPortfolios] = useState<P[]>(initial);
  const [selected, setSelected] = useState<number | null>(initial[0]?.id ?? null);
  const { data, loading, refresh, error } = useApi<PortfolioSummaryDTO>(selected ? `/api/portfolios/${selected}` : null);
  const history = useApi<History>(selected ? `/api/portfolios/${selected}/history` : null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [newName, setNewName] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<"Performance" | "Value">("Performance");
  const [allocBy, setAllocBy] = useState<"Holding" | "Sector">("Holding");

  const current = portfolios.find((p) => p.id === selected) ?? null;
  const reload = () => {
    refresh();
    history.refresh();
  };

  async function act(fn: () => Promise<void>) {
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  const chartOption = useMemo(() => {
    const pts = history.data?.points ?? [];
    if (pts.length === 0) return null;
    if (chartMode === "Value") {
      return {
        grid: { left: 64, right: 16, top: 24, bottom: 28 },
        tooltip: { trigger: "axis" },
        xAxis: { type: "category", data: pts.map((p) => p.date), ...axisStyle },
        yAxis: { type: "value", scale: true, ...axisStyle },
        series: [{ name: "Market value (₹)", type: "line", showSymbol: false, data: pts.map((p) => Math.round(p.value)), areaStyle: { opacity: 0.12 } }],
      };
    }
    const bm = new Map((history.data?.benchmark ?? []).map((b) => [b.date, b.index]));
    return {
      grid: { left: 48, right: 16, top: 28, bottom: 28 },
      tooltip: { trigger: "axis" },
      legend: { top: 0, textStyle: { color: "#b3bac1" } },
      xAxis: { type: "category", data: pts.map((p) => p.date), ...axisStyle },
      yAxis: { type: "value", scale: true, ...axisStyle },
      series: [
        { name: "Portfolio (time-weighted, base 100)", type: "line", showSymbol: false, data: pts.map((p) => +p.twrIndex.toFixed(2)) },
        ...(bm.size ? [{ name: "Benchmark (base 100)", type: "line", showSymbol: false, data: pts.map((p) => (bm.has(p.date) ? +bm.get(p.date)!.toFixed(2) : null)), lineStyle: { type: "dashed" } }] : []),
      ],
    };
  }, [history.data, chartMode]);

  const allocOption = useMemo(() => {
    if (!data) return null;
    const items =
      allocBy === "Holding"
        ? data.concentration.weights.map((w) => ({ name: w.key, value: +(w.weight * 100).toFixed(2) }))
        : data.concentration.bySector.map((s) => ({ name: s.sector, value: +(s.weight * 100).toFixed(2) }));
    if (items.length === 0) return null;
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c}%" },
      series: [{ type: "pie", radius: ["45%", "72%"], itemStyle: { borderColor: "#15181b", borderWidth: 2 }, label: { color: "#b3bac1", fontSize: 10.5 }, data: items }],
    };
  }, [data, allocBy]);

  if (!current) {
    return (
      <EmptyState
        title="No portfolios"
        action={
          <button
            type="button"
            className={buttonClass("primary")}
            onClick={() =>
              act(async () => {
                const { portfolio } = await apiFetch<{ portfolio: P }>("/api/portfolios", { body: { name: "Paper Portfolio" } });
                setPortfolios([portfolio]);
                setSelected(portfolio.id);
              })
            }
          >
            Create a paper portfolio
          </button>
        }
      >
        Paper portfolios track hypothetical trades. No real orders are placed.
        {actionError ? <span className="mt-2 block text-down">{actionError}</span> : null}
      </EmptyState>
    );
  }

  const t = data?.totals;
  const statuses = (data?.statuses ?? []) as DisplayStatus[];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-panel border border-line bg-panel px-3 py-2">
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          Portfolio
          <select value={selected ?? ""} onChange={(e) => setSelected(Number(e.target.value))} className="h-7 rounded border border-line-strong bg-bg px-2 text-[12.5px] text-fg">
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          Benchmark
          <select
            value={current.benchmarkInstrumentId ?? ""}
            onChange={(e) =>
              act(async () => {
                const benchmarkInstrumentId = e.target.value ? Number(e.target.value) : null;
                await apiFetch(`/api/portfolios/${current.id}`, { method: "PATCH", body: { benchmarkInstrumentId } });
                setPortfolios((ps) => ps.map((p) => (p.id === current.id ? { ...p, benchmarkInstrumentId } : p)));
                history.refresh();
              })
            }
            className="h-7 rounded border border-line-strong bg-bg px-2 text-[12.5px] text-fg"
          >
            <option value="">None</option>
            {benchmarks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        {statuses.map((s) => (
          <StatusBadge key={s} status={s} />
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                const { portfolio } = await apiFetch<{ portfolio: P }>("/api/portfolios", { body: { name: newName } });
                setPortfolios((ps) => [...ps, portfolio]);
                setSelected(portfolio.id);
                setNewName("");
              });
            }}
          >
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New portfolio name" aria-label="New portfolio name" className={cn(inputClass, "h-7 w-44")} maxLength={80} />
            <button type="submit" className={buttonClass("default", "sm")} disabled={!newName.trim()}>
              <Plus className="size-3.5" aria-hidden /> Create
            </button>
          </form>
          <button
            type="button"
            className={buttonClass("danger", "sm")}
            onClick={() =>
              act(async () => {
                if (!confirm(`Delete portfolio “${current.name}” and all its transactions?`)) return;
                await apiFetch(`/api/portfolios/${current.id}`, { method: "DELETE" });
                const rest = portfolios.filter((p) => p.id !== current.id);
                setPortfolios(rest);
                setSelected(rest[0]?.id ?? null);
              })
            }
          >
            <Trash2 className="size-3.5" aria-hidden /> Delete
          </button>
        </div>
      </div>

      {actionError || error ? <Callout tone="error">{actionError ?? error}</Callout> : null}
      {data?.missingPrices.length ? (
        <Callout tone="warn" title="Missing market prices">
          No current price for {data.missingPrices.join(", ")}. Market value and unrealised P&amp;L totals are not shown rather than understated.
        </Callout>
      ) : null}
      {data?.issues.length ? (
        <Callout tone={data.issues.some((i) => i.severity === "error") ? "error" : "warn"} title="Ledger issues">
          <ul className="list-disc pl-4">
            {data.issues.map((i, k) => (
              <li key={k}>
                Transaction #{i.txId}: {i.message}
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}

      <div className="grid grid-cols-2 gap-3 rounded-panel border border-line bg-panel p-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Market value" value={t?.marketValue != null ? fmtINR(t.marketValue, 0) : "—"} sub={t && !t.complete ? <span className="text-stale">incomplete prices</span> : null} />
        <Stat label="Cost basis" value={t ? fmtINR(t.costBasis, 0) : "—"} />
        <Stat
          label="Unrealised P&L"
          value={<Change value={t?.unrealizedPnl ?? null} />}
          sub={t?.unrealizedPnl != null && t.costBasis > 0 ? <Change pct={(t.unrealizedPnl / t.costBasis) * 100} /> : null}
        />
        <Stat label="Realised P&L" value={<Change value={t?.realizedPnl ?? null} />} />
        <Stat label="Dividends" value={t ? fmtINR(t.dividendIncome, 0) : "—"} />
        <Stat label="Fees paid" value={t ? fmtINR(t.feesPaid, 0) : "—"} sub={<span className="text-faint">{t?.openPositions ?? 0} open positions</span>} />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <section className="rounded-panel border border-line bg-panel xl:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">Performance</h2>
            <SegButton label="Chart mode" value={chartMode} options={["Performance", "Value"] as const} onChange={setChartMode} />
          </div>
          <div className="p-2">
            {history.loading && !history.data ? (
              <div className="h-[260px] animate-pulse rounded bg-panel-2" />
            ) : chartOption ? (
              <EChart option={chartOption} height={260} ariaLabel="Portfolio performance chart" />
            ) : (
              <p className="py-16 text-center text-[12px] text-muted">{history.data?.note ?? "No history yet."}</p>
            )}
          </div>
          <p className="border-t border-line px-3 py-1.5 text-[10.5px] text-faint">
            Time-weighted return neutralises the effect of buys and sells. Days where a held instrument has no stored price are skipped.
          </p>
        </section>
        <section className="rounded-panel border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">Allocation</h2>
            <SegButton label="Allocate by" value={allocBy} options={["Holding", "Sector"] as const} onChange={setAllocBy} />
          </div>
          <div className="p-2">{allocOption ? <EChart option={allocOption} height={230} ariaLabel="Portfolio allocation" /> : <p className="py-16 text-center text-[12px] text-muted">No priced holdings.</p>}</div>
          {data?.concentration.hhi != null ? (
            <p className="border-t border-line px-3 py-1.5 text-[11px] text-muted">
              Concentration (HHI) {data.concentration.hhi.toFixed(3)} · effective N {data.concentration.effectiveN?.toFixed(1)}
            </p>
          ) : null}
        </section>
      </div>

      <section className="rounded-panel border border-line bg-panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">Holdings</h2>
          <button type="button" className={cn(buttonClass("ghost", "sm"), "ml-auto")} onClick={() => downloadFile(`/api/portfolios/${current.id}/export?kind=holdings`, "holdings.csv").catch((e: Error) => setActionError(e.message))}>
            <Download className="size-3.5" aria-hidden /> CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th className="r">Qty</th>
                <th className="r">Avg cost</th>
                <th className="r">Cost basis</th>
                <th className="r">Last</th>
                <th className="r">Market value</th>
                <th className="r">Unrealised</th>
                <th className="r">Realised</th>
                <th className="r">Dividends</th>
                <th>Price data</th>
              </tr>
            </thead>
            <tbody>
              {(data?.positions ?? []).map((p) => (
                <tr key={p.instrumentId}>
                  <td>
                    <Link href={securityHref(p.exchange, p.symbol)} className="num font-semibold text-accent-strong hover:underline">
                      {p.symbol}
                    </Link>
                    <span className="ml-1 text-[10px] text-faint">{p.exchange}</span>
                  </td>
                  <td className="r num">{fmtNumber(p.quantity, p.quantity % 1 ? 4 : 0)}</td>
                  <td className="r num">{fmtPrice(p.averageCost)}</td>
                  <td className="r num">{fmtINR(p.costBasis, 0)}</td>
                  <td className="r num">{fmtPrice(p.price)}</td>
                  <td className="r num">{p.marketValue != null ? fmtINR(p.marketValue, 0) : <span className="text-stale">no price</span>}</td>
                  <td className="r num">
                    <Change value={p.unrealizedPnl} />
                    {p.unrealizedPct != null ? <span className="ml-1 text-[10.5px] text-faint">({fmtRatioPct(p.unrealizedPct, 1, true)})</span> : null}
                  </td>
                  <td className="r num">
                    <Change value={p.realizedPnl} />
                  </td>
                  <td className="r num">{fmtINR(p.dividendIncome, 0)}</td>
                  <td>{p.priceStatus ? <StatusBadge status={p.priceStatus as DisplayStatus} /> : <Badge tone="down">none</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.positions.length === 0 ? <p className="px-3 py-8 text-center text-[12px] text-muted">No holdings. Add a BUY transaction below.</p> : null}
          {loading && !data ? <div className="h-24 animate-pulse bg-panel-2" /> : null}
        </div>
      </section>

      <section className="rounded-panel border border-line bg-panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">Transactions</h2>
          <div className="ml-auto flex gap-2">
            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => downloadFile(`/api/portfolios/${current.id}/export?kind=transactions`, "transactions.csv").catch((e: Error) => setActionError(e.message))}>
              <Download className="size-3.5" aria-hidden /> CSV
            </button>
            <button
              type="button"
              className={buttonClass("primary", "sm")}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-3.5" aria-hidden /> Add transaction
            </button>
          </div>
        </div>
        {formOpen ? (
          <div className="border-b border-line bg-panel-2 p-3">
            <TxForm
              key={editing?.id ?? "new"}
              portfolioId={current.id}
              editing={editing}
              onDone={() => {
                setFormOpen(false);
                setEditing(null);
                reload();
              }}
              onCancel={() => {
                setFormOpen(false);
                setEditing(null);
              }}
            />
          </div>
        ) : null}
        <div className="max-h-[420px] overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Symbol</th>
                <th className="r">Qty</th>
                <th className="r">Price</th>
                <th className="r">Fees</th>
                <th className="r">Amount</th>
                <th>Notes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...(data?.transactions ?? [])].reverse().map((tx) => (
                <tr key={tx.id}>
                  <td className="num">{formatISTDate(tx.tradeDate)}</td>
                  <td>
                    <Badge tone={tx.type === "BUY" ? "up" : tx.type === "SELL" ? "down" : "info"}>{tx.type}</Badge>
                  </td>
                  <td className="num font-semibold">{tx.symbol}</td>
                  <td className="r num">{tx.type === "SPLIT" ? `×${tx.splitRatio}` : tx.quantity ? fmtNumber(tx.quantity, tx.quantity % 1 ? 4 : 0) : "—"}</td>
                  <td className="r num">{tx.price ? fmtPrice(tx.price) : "—"}</td>
                  <td className="r num">{fmtPrice(tx.fees)}</td>
                  <td className="r num">{tx.type === "DIVIDEND" ? fmtINR(tx.amount) : tx.type === "SPLIT" ? "—" : fmtINR(tx.quantity * tx.price)}</td>
                  <td className="max-w-[200px] truncate text-muted">{tx.notes ?? ""}</td>
                  <td className="whitespace-nowrap">
                    <button
                      type="button"
                      className="rounded p-1 text-faint hover:text-fg"
                      aria-label={`Edit transaction ${tx.id}`}
                      onClick={() => {
                        setEditing(tx);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-faint hover:text-down"
                      aria-label={`Delete transaction ${tx.id}`}
                      onClick={() =>
                        act(async () => {
                          if (!confirm("Delete this transaction?")) return;
                          await apiFetch(`/api/transactions/${tx.id}`, { method: "DELETE" });
                          reload();
                        })
                      }
                    >
                      <X className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.transactions.length === 0 ? <p className="px-3 py-8 text-center text-[12px] text-muted">No transactions recorded.</p> : null}
        </div>
      </section>
    </div>
  );
}
