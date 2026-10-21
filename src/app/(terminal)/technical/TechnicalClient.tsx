"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PriceChart, type Overlay, type Pane } from "@/components/charts/PriceChart";
import { SegButton } from "@/components/InstrumentChart";
import { InstrumentPicker, type PickedInstrument } from "@/components/InstrumentPicker";
import { Callout, StatusBadge } from "@/components/ui";
import { useApi } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { RANGE_OPTIONS, type RangeOption } from "@/lib/dates";
import type { Bar } from "@/lib/finance/aggregate";
import { atr, bollinger, drawdowns, ema, macd, maxDrawdown, percentReturns, rollingVolatility, rsi, sma, volumeAverage } from "@/lib/finance/indicators";
import { fmtCompact, fmtNumber, fmtPrice, fmtRatioPct } from "@/lib/format";
import type { DisplayStatus } from "@/lib/market/types";

interface Params {
  sma: number;
  ema: number;
  bbPeriod: number;
  bbMult: number;
  rsi: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  atr: number;
  volAvg: number;
  volWindow: number;
}

const DEFAULTS: Params = { sma: 50, ema: 21, bbPeriod: 20, bbMult: 2, rsi: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, atr: 14, volAvg: 20, volWindow: 20 };

type Ind = "SMA" | "EMA" | "Bollinger" | "RSI" | "MACD" | "ATR" | "Volatility" | "Drawdown";

const last = (xs: (number | null)[]) => {
  for (let i = xs.length - 1; i >= 0; i--) if (xs[i] != null) return xs[i]!;
  return null;
};

function NumInput({ label, value, onChange, min = 1, max = 400, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-muted">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= min && v <= max) onChange(v);
        }}
        className="h-6 w-14 rounded border border-line-strong bg-bg px-1 text-[11.5px] text-fg"
      />
    </label>
  );
}

export function TechnicalClient({ initial }: { initial: PickedInstrument | null }) {
  const router = useRouter();
  const [inst, setInst] = useState<PickedInstrument | null>(initial);
  const [range, setRange] = useState<RangeOption>("1Y");
  const [p, setP] = useState<Params>(DEFAULTS);
  const [on, setOn] = useState<Set<Ind>>(new Set(["SMA", "EMA", "RSI", "MACD"]));
  const { data, loading, error } = useApi<{ bars: Bar[]; status: DisplayStatus }>(inst ? `/api/instruments/${inst.id}/bars?range=${range}` : null);
  const bars = useMemo(() => data?.bars ?? [], [data]);

  const toggle = (k: Ind) =>
    setOn((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const set = (k: keyof Params) => (v: number) => setP((x) => ({ ...x, [k]: v }));

  const computed = useMemo(() => {
    const c = bars.map((b) => b.close);
    const macdRes = p.macdFast < p.macdSlow ? macd(c, p.macdFast, p.macdSlow, p.macdSignal) : null;
    return {
      sma: sma(c, p.sma),
      ema: ema(c, p.ema),
      bb: bollinger(c, p.bbPeriod, p.bbMult),
      rsi: rsi(c, p.rsi),
      macd: macdRes,
      atr: atr(bars, p.atr),
      volAvg: volumeAverage(bars.map((b) => b.volume), p.volAvg),
      vol: rollingVolatility(c, p.volWindow),
      dd: drawdowns(c),
      mdd: maxDrawdown(c),
      ret: c.length > 1 ? c[c.length - 1]! / c[0]! - 1 : null,
      daily: percentReturns(c),
    };
  }, [bars, p]);

  const overlays: Overlay[] = useMemo(() => {
    const o: Overlay[] = [];
    if (on.has("SMA")) o.push({ name: `SMA ${p.sma}`, values: computed.sma, color: "#e2b13c" });
    if (on.has("EMA")) o.push({ name: `EMA ${p.ema}`, values: computed.ema, color: "#6ea8fe" });
    if (on.has("Bollinger"))
      o.push(
        { name: "BB upper", values: computed.bb.upper, color: "#7f8992", dashed: true },
        { name: "BB mid", values: computed.bb.middle, color: "#5b646c" },
        { name: "BB lower", values: computed.bb.lower, color: "#7f8992", dashed: true },
      );
    return o;
  }, [on, computed, p.sma, p.ema]);

  const panes: Pane[] = useMemo(() => {
    const out: Pane[] = [];
    if (on.has("RSI")) out.push({ name: "RSI", lines: [{ name: `RSI ${p.rsi}`, values: computed.rsi, color: "#c48cf0" }], guides: [30, 70] });
    if (on.has("MACD") && computed.macd)
      out.push({
        name: "MACD",
        histogram: { name: "Histogram", values: computed.macd.histogram },
        lines: [
          { name: "MACD", values: computed.macd.macd, color: "#4fb6b0" },
          { name: "Signal", values: computed.macd.signal, color: "#f08c5a" },
        ],
      });
    if (on.has("ATR")) out.push({ name: "ATR", lines: [{ name: `ATR ${p.atr}`, values: computed.atr, color: "#9bd46a" }], height: 90 });
    if (on.has("Volatility")) out.push({ name: "Volatility", lines: [{ name: "Ann. vol", values: computed.vol.map((v) => (v == null ? null : v * 100)), color: "#e2b13c" }], height: 90 });
    if (on.has("Drawdown")) out.push({ name: "Drawdown", lines: [{ name: "Drawdown %", values: computed.dd.map((v) => v * 100), color: "#e0605a" }], height: 90 });
    return out;
  }, [on, computed, p.rsi, p.atr]);

  const insufficient = bars.length > 0 && bars.length < Math.max(p.sma, p.macdSlow + p.macdSignal, p.bbPeriod, p.rsi + 1);

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-col gap-2 rounded-panel border border-line bg-panel p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full sm:w-80">
            <InstrumentPicker
              value={inst}
              onChange={(v) => {
                setInst(v);
                router.replace(v ? `/technical?id=${v.id}` : "/technical", { scroll: false });
              }}
            />
          </div>
          <SegButton label="Range" value={range} options={RANGE_OPTIONS} onChange={setRange} />
          {data ? <StatusBadge status={data.status} /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Indicators">
          {(["SMA", "EMA", "Bollinger", "RSI", "MACD", "ATR", "Volatility", "Drawdown"] as Ind[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={on.has(k)}
              onClick={() => toggle(k)}
              className={cn("h-6 rounded border px-2 text-[11px]", on.has(k) ? "border-accent/50 bg-accent-soft text-accent-strong" : "border-line text-muted hover:text-fg")}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-2">
          {on.has("SMA") ? <NumInput label="SMA" value={p.sma} onChange={set("sma")} /> : null}
          {on.has("EMA") ? <NumInput label="EMA" value={p.ema} onChange={set("ema")} /> : null}
          {on.has("Bollinger") ? (
            <>
              <NumInput label="BB period" value={p.bbPeriod} onChange={set("bbPeriod")} />
              <NumInput label="BB σ" value={p.bbMult} onChange={set("bbMult")} min={0.5} max={5} step={0.5} />
            </>
          ) : null}
          {on.has("RSI") ? <NumInput label="RSI" value={p.rsi} onChange={set("rsi")} min={2} max={100} /> : null}
          {on.has("MACD") ? (
            <>
              <NumInput label="MACD fast" value={p.macdFast} onChange={set("macdFast")} max={100} />
              <NumInput label="slow" value={p.macdSlow} onChange={set("macdSlow")} max={200} />
              <NumInput label="signal" value={p.macdSignal} onChange={set("macdSignal")} max={100} />
            </>
          ) : null}
          {on.has("ATR") ? <NumInput label="ATR" value={p.atr} onChange={set("atr")} max={100} /> : null}
          {on.has("Volatility") ? <NumInput label="Vol window" value={p.volWindow} onChange={set("volWindow")} min={5} max={250} /> : null}
          <button type="button" className="ml-auto text-[11px] text-accent hover:underline" onClick={() => setP(DEFAULTS)}>
            Reset parameters
          </button>
        </div>
        {p.macdFast >= p.macdSlow && on.has("MACD") ? <p className="text-[11px] text-down">MACD fast period must be shorter than the slow period.</p> : null}
      </section>

      {!inst ? (
        <p className="rounded-panel border border-line bg-panel px-3 py-10 text-center text-[12.5px] text-muted">Choose a security to analyse.</p>
      ) : error ? (
        <Callout tone="error">{error}</Callout>
      ) : (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
          <section className="rounded-panel border border-line bg-panel p-2">
            {loading && !data ? <div className="h-[420px] animate-pulse rounded bg-panel-2" /> : <PriceChart bars={bars} overlays={overlays} panes={panes} height={360} label={inst.symbol} />}
            {insufficient ? <p className="mt-2 text-[11px] text-stale">Some indicators need more history than this range provides; their early values are blank rather than estimated.</p> : null}
          </section>
          <section className="rounded-panel border border-line bg-panel">
            <h2 className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">Latest values</h2>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 p-3 text-[12.5px]">
              {(
                [
                  ["Close", fmtPrice(bars.at(-1)?.close)],
                  [`SMA ${p.sma}`, fmtPrice(last(computed.sma))],
                  [`EMA ${p.ema}`, fmtPrice(last(computed.ema))],
                  ["Bollinger upper", fmtPrice(last(computed.bb.upper))],
                  ["Bollinger lower", fmtPrice(last(computed.bb.lower))],
                  [`RSI ${p.rsi}`, fmtNumber(last(computed.rsi), 1)],
                  ["MACD", fmtNumber(computed.macd ? last(computed.macd.macd) : null, 2)],
                  ["MACD signal", fmtNumber(computed.macd ? last(computed.macd.signal) : null, 2)],
                  [`ATR ${p.atr}`, fmtNumber(last(computed.atr), 2)],
                  [`Avg volume ${p.volAvg}`, fmtCompact(last(computed.volAvg))],
                  [`Volatility ${p.volWindow}d (ann.)`, fmtRatioPct(last(computed.vol), 1)],
                  ["Return over range", fmtRatioPct(computed.ret, 2, true)],
                  ["Max drawdown", fmtRatioPct(computed.mdd?.maxDrawdown ?? null, 2)],
                  ["Current drawdown", fmtRatioPct(computed.dd.at(-1) ?? null, 2)],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{k}</dt>
                  <dd className="num text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="border-t border-line px-3 py-2 text-[10.5px] text-faint">
              Calculated in your browser from {bars.length} daily bars. RSI and ATR use Wilder smoothing; Bollinger Bands use population σ; volatility is the
              sample σ of log returns × √252. Indicators describe past prices and are not predictions or trading signals.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
