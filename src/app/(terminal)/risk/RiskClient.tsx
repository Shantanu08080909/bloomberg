"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { EChart, axisStyle } from "@/components/charts/EChart";
import { SegButton } from "@/components/InstrumentChart";
import { InstrumentPicker, type PickedInstrument } from "@/components/InstrumentPicker";
import { buttonClass, Callout, Stat } from "@/components/ui";
import { apiFetch } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { formatISTDate } from "@/lib/dates";
import { fmtNumber, fmtRatioPct } from "@/lib/format";
import type { PortfolioSummaryDTO } from "@/lib/server/portfolio-dto";

interface Summary {
  observations: number;
  annualizedReturn: number | null;
  annualizedVolatility: number | null;
  sharpe: number | null;
  sortino: number | null;
  maxDrawdown: number | null;
  beta: number | null;
  correlationToBenchmark: number | null;
}

type Report =
  | { insufficient: true; observations: number }
  | {
      insufficient: false;
      from: string;
      to: string;
      observations: number;
      weights: Record<string, number>;
      perInstrument: (Summary & { instrumentId: number })[];
      portfolio: Summary;
      portfolioIndex: { date: string; value: number }[];
      benchmarkIndex: { date: string; value: number }[];
      correlation: { keys: string[]; matrix: (number | null)[][] };
      stress: { start: string; end: string; ret: number; portfolioReturn: number }[];
    };

interface Holding extends PickedInstrument {
  weight: number;
  sector?: string | null;
}

const LOOKBACKS = { "6M": 183, "1Y": 365, "2Y": 730, "3Y": 1095 } as const;

export function RiskClient({ portfolios, benchmarks }: { portfolios: { id: number; name: string }[]; benchmarks: { id: number; name: string }[] }) {
  const [mode, setMode] = useState<"Portfolio" | "Custom basket">(portfolios.length ? "Portfolio" : "Custom basket");
  const [portfolioId, setPortfolioId] = useState<number | null>(portfolios[0]?.id ?? null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [benchmarkId, setBenchmarkId] = useState<number | null>(benchmarks[0]?.id ?? null);
  const [rf, setRf] = useState(6.5);
  const [lookback, setLookback] = useState<keyof typeof LOOKBACKS>("1Y");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sectorConc, setSectorConc] = useState<{ sector: string; weight: number }[]>([]);
  const [picker, setPicker] = useState<PickedInstrument | null>(null);

  useEffect(() => {
    if (mode !== "Portfolio" || !portfolioId) return;
    setNote(null);
    apiFetch<PortfolioSummaryDTO>(`/api/portfolios/${portfolioId}`)
      .then((s) => {
        const priced = s.positions.filter((p) => p.quantity > 0 && p.marketValue != null);
        setHoldings(priced.map((p) => ({ id: p.instrumentId, symbol: p.symbol, exchange: p.exchange, name: p.name, weight: p.marketValue!, sector: p.sector })));
        setSectorConc(s.concentration.bySector);
        if (s.positions.some((p) => p.quantity > 0 && p.marketValue == null)) setNote("Positions without a current price are excluded.");
        if (priced.length === 0) setNote("This portfolio has no priced open positions. Add transactions in Portfolio Manager, or use a custom basket.");
      })
      .catch((e: Error) => setError(e.message));
  }, [mode, portfolioId]);

  useEffect(() => {
    if (holdings.length === 0) {
      setReport(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    apiFetch<{ report: Report | null }>("/api/risk", {
      body: {
        instrumentIds: holdings.map((h) => h.id),
        weights: Object.fromEntries(holdings.map((h) => [h.id, h.weight])),
        benchmarkId,
        riskFreeRate: rf / 100,
        lookbackDays: LOOKBACKS[lookback],
      },
      signal: ctrl.signal,
    })
      .then((r) => setReport(r.report))
      .catch((e: Error) => e.name !== "AbortError" && setError(e.message))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [holdings, benchmarkId, rf, lookback]);

  const symbolOf = (id: string | number) => holdings.find((h) => String(h.id) === String(id))?.symbol ?? String(id);

  const corrOption = useMemo(() => {
    if (!report || report.insufficient) return null;
    const keys = report.correlation.keys.map(symbolOf);
    const data: [number, number, number | null][] = [];
    report.correlation.matrix.forEach((row, i) => row.forEach((v, j) => data.push([j, i, v == null ? null : +v.toFixed(2)])));
    return {
      tooltip: { formatter: (p: { data: [number, number, number | null] }) => `${keys[p.data[1]]} / ${keys[p.data[0]]}: ${p.data[2] ?? "n/a"}` },
      grid: { left: 80, right: 16, top: 8, bottom: 56 },
      xAxis: { type: "category", data: keys, ...axisStyle, axisLabel: { ...axisStyle.axisLabel, rotate: 45 } },
      yAxis: { type: "category", data: keys, ...axisStyle },
      visualMap: { min: -1, max: 1, calculable: false, orient: "horizontal", left: "center", bottom: 0, show: false, inRange: { color: ["#e0605a", "#1b1f23", "#4fb6b0"] } },
      series: [{ type: "heatmap", data, label: { show: keys.length <= 10, color: "#e4e7ea", fontSize: 10 } }],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  const perfOption = useMemo(() => {
    if (!report || report.insufficient) return null;
    return {
      grid: { left: 48, right: 16, top: 28, bottom: 24 },
      tooltip: { trigger: "axis" },
      legend: { top: 0, textStyle: { color: "#b3bac1" } },
      xAxis: { type: "category", data: report.portfolioIndex.map((p) => p.date), ...axisStyle },
      yAxis: { type: "value", scale: true, ...axisStyle },
      series: [
        { name: "Basket (fixed weights, base 100)", type: "line", showSymbol: false, data: report.portfolioIndex.map((p) => +p.value.toFixed(2)) },
        ...(report.benchmarkIndex.length ? [{ name: "Benchmark (base 100)", type: "line", showSymbol: false, lineStyle: { type: "dashed" }, data: report.benchmarkIndex.map((p) => +p.value.toFixed(2)) }] : []),
      ],
    };
  }, [report]);

  const totalW = holdings.reduce((s, h) => s + h.weight, 0);
  const p = report && !report.insufficient ? report.portfolio : null;

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-wrap items-end gap-3 rounded-panel border border-line bg-panel p-3">
        <SegButton label="Positions from" value={mode} options={["Portfolio", "Custom basket"] as const} onChange={(m) => { setMode(m); if (m === "Custom basket") { setHoldings([]); setSectorConc([]); setNote(null); } }} />
        {mode === "Portfolio" ? (
          <label className="flex flex-col gap-1 text-[11px] text-muted">
            Portfolio
            <select value={portfolioId ?? ""} onChange={(e) => setPortfolioId(Number(e.target.value))} className="h-7 rounded border border-line-strong bg-bg px-2 text-[12.5px] text-fg">
              {portfolios.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          Benchmark
          <select value={benchmarkId ?? ""} onChange={(e) => setBenchmarkId(e.target.value ? Number(e.target.value) : null)} className="h-7 rounded border border-line-strong bg-bg px-2 text-[12.5px] text-fg">
            <option value="">None</option>
            {benchmarks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          Risk-free rate (annual %)
          <input type="number" step="0.1" min="0" max="30" value={rf} onChange={(e) => setRf(Number(e.target.value))} className="num h-7 w-24 rounded border border-line-strong bg-bg px-2 text-[12.5px] text-fg" />
        </label>
        <div className="flex flex-col gap-1 text-[11px] text-muted">
          Lookback
          <SegButton label="Lookback" value={lookback} options={Object.keys(LOOKBACKS) as (keyof typeof LOOKBACKS)[]} onChange={setLookback} />
        </div>
        {loading ? <Loader2 className="mb-1.5 size-4 animate-spin text-muted" aria-label="Calculating" /> : null}
      </section>

      {mode === "Custom basket" ? (
        <section className="rounded-panel border border-line bg-panel p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-80">
              <InstrumentPicker
                value={picker}
                onChange={(v) => {
                  if (v && !holdings.some((h) => h.id === v.id)) setHoldings((hs) => [...hs, { ...v, weight: 1 }]);
                  setPicker(null);
                }}
                placeholder="Add a security to the basket…"
              />
            </div>
            <span className="text-[11px] text-faint">Weights are relative; they are normalised to 100%.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {holdings.map((h) => (
              <div key={h.id} className="flex items-center gap-1.5 rounded border border-line bg-panel-2 px-2 py-1">
                <span className="num text-[12px] font-semibold text-accent-strong">{h.symbol}</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={h.weight}
                  onChange={(e) => setHoldings((hs) => hs.map((x) => (x.id === h.id ? { ...x, weight: Math.max(0, Number(e.target.value)) } : x)))}
                  className="num h-6 w-16 rounded border border-line bg-bg px-1 text-right text-[12px]"
                  aria-label={`${h.symbol} weight`}
                />
                <span className="num w-12 text-right text-[11px] text-faint">{totalW ? ((h.weight / totalW) * 100).toFixed(1) : 0}%</span>
                <button type="button" onClick={() => setHoldings((hs) => hs.filter((x) => x.id !== h.id))} className="rounded p-0.5 text-faint hover:text-down" aria-label={`Remove ${h.symbol}`}>
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            {holdings.length === 0 ? (
              <button type="button" className={buttonClass("ghost", "sm")} disabled>
                <Plus className="size-3.5" /> Add securities above
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {note ? <Callout tone="warn">{note}</Callout> : null}
      {error ? <Callout tone="error">{error}</Callout> : null}
      {report?.insufficient ? <Callout tone="warn">Only {report.observations} common trading days are available — at least 30 are needed for meaningful statistics.</Callout> : null}

      {p && report && !report.insufficient ? (
        <>
          <div className="grid grid-cols-2 gap-3 rounded-panel border border-line bg-panel p-3 sm:grid-cols-4 lg:grid-cols-8">
            <Stat label="Ann. return" value={fmtRatioPct(p.annualizedReturn, 1, true)} />
            <Stat label="Ann. volatility" value={fmtRatioPct(p.annualizedVolatility, 1)} />
            <Stat label="Sharpe" value={fmtNumber(p.sharpe, 2)} />
            <Stat label="Sortino" value={fmtNumber(p.sortino, 2)} />
            <Stat label="Max drawdown" value={<span className="text-down">{fmtRatioPct(p.maxDrawdown, 1)}</span>} />
            <Stat label="Beta" value={fmtNumber(p.beta, 2)} />
            <Stat label="Correlation" value={fmtNumber(p.correlationToBenchmark, 2)} />
            <Stat label="Observations" value={String(report.observations)} sub={<span className="text-faint">{formatISTDate(report.from)} – {formatISTDate(report.to)}</span>} />
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            <section className="rounded-panel border border-line bg-panel">
              <h2 className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">Basket vs benchmark</h2>
              <div className="p-2">{perfOption ? <EChart option={perfOption} height={260} ariaLabel="Basket performance versus benchmark" /> : null}</div>
            </section>
            <section className="rounded-panel border border-line bg-panel">
              <h2 className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">Correlation of daily returns</h2>
              <div className="p-2">{corrOption ? <EChart option={corrOption} height={260} ariaLabel="Correlation matrix heatmap" /> : null}</div>
            </section>
          </div>
          <div className="grid gap-3 xl:grid-cols-3">
            <section className="rounded-panel border border-line bg-panel xl:col-span-2">
              <h2 className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">Per position</h2>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th className="r">Weight</th>
                      <th className="r">Ann. return</th>
                      <th className="r">Ann. vol</th>
                      <th className="r">Sharpe</th>
                      <th className="r">Max DD</th>
                      <th className="r">Beta</th>
                      <th className="r">Corr.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.perInstrument.map((r) => (
                      <tr key={r.instrumentId}>
                        <td className="num font-semibold">{symbolOf(r.instrumentId)}</td>
                        <td className="r num">{fmtRatioPct(report.weights[String(r.instrumentId)] ?? null, 1)}</td>
                        <td className={cn("r num", (r.annualizedReturn ?? 0) >= 0 ? "text-up" : "text-down")}>{fmtRatioPct(r.annualizedReturn, 1, true)}</td>
                        <td className="r num">{fmtRatioPct(r.annualizedVolatility, 1)}</td>
                        <td className="r num">{fmtNumber(r.sharpe, 2)}</td>
                        <td className="r num text-down">{fmtRatioPct(r.maxDrawdown, 1)}</td>
                        <td className="r num">{fmtNumber(r.beta, 2)}</td>
                        <td className="r num">{fmtNumber(r.correlationToBenchmark, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <div className="flex flex-col gap-3">
              <section className="rounded-panel border border-line bg-panel">
                <h2 className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">Historical stress windows</h2>
                {report.stress.length ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Worst benchmark 20-day window</th>
                        <th className="r">Benchmark</th>
                        <th className="r">Basket</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.stress.map((s) => (
                        <tr key={s.start}>
                          <td className="num text-[11.5px]">
                            {formatISTDate(s.start)} → {formatISTDate(s.end)}
                          </td>
                          <td className="r num text-down">{fmtRatioPct(s.ret, 1, true)}</td>
                          <td className={cn("r num", s.portfolioReturn >= 0 ? "text-up" : "text-down")}>{fmtRatioPct(s.portfolioReturn, 1, true)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="p-3 text-[12px] text-muted">Choose a benchmark to see stress windows.</p>
                )}
              </section>
              <section className="rounded-panel border border-line bg-panel">
                <h2 className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">Concentration</h2>
                <div className="p-3 text-[12px]">
                  {(() => {
                    const ws = Object.values(report.weights);
                    const hhi = ws.reduce((s, w) => s + w * w, 0);
                    return (
                      <p className="mb-2 text-dim">
                        Largest position {fmtRatioPct(Math.max(...ws), 1)} · HHI {hhi.toFixed(3)} · effective N {(1 / hhi).toFixed(1)}
                      </p>
                    );
                  })()}
                  {sectorConc.length ? (
                    <ul className="flex flex-col gap-1">
                      {sectorConc.map((s) => (
                        <li key={s.sector} className="grid grid-cols-[1fr_120px_48px] items-center gap-2">
                          <span className="truncate text-muted">{s.sector}</span>
                          <span className="h-1.5 rounded bg-raised">
                            <span className="block h-1.5 rounded bg-accent" style={{ width: `${s.weight * 100}%` }} />
                          </span>
                          <span className="num text-right">{fmtRatioPct(s.weight, 1)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-faint">Sector concentration is shown for portfolios.</p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </>
      ) : !loading && holdings.length === 0 && mode === "Custom basket" ? (
        <p className="rounded-panel border border-line bg-panel px-3 py-10 text-center text-[12.5px] text-muted">Add securities to analyse a basket.</p>
      ) : null}

      <Callout tone="info" title="Method and assumptions">
        Simple daily close-to-close returns on dates common to every series (missing dates are dropped, never filled). Annualisation uses 252 trading days.
        Sharpe = (mean daily return − rf/252) × 252 ÷ (daily σ × √252); Sortino uses downside deviation. Beta = cov(asset, benchmark) / var(benchmark).
        The basket is a fixed-weight, daily-rebalanced series using current weights. Historical figures describe the past and do not predict future risk.
      </Callout>
    </div>
  );
}
