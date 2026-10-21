"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { EChart, axisStyle } from "@/components/charts/EChart";
import { Badge, buttonClass, Callout, Stat } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  breakEven,
  cagr,
  capmCostOfEquity,
  compoundInterest,
  dcf,
  dcfSensitivity,
  gordonDdm,
  impliedValueFromMultiples,
  scenarioAnalysis,
  sipProjection,
  twoStageDdm,
  wacc,
  xirr,
} from "@/lib/finance/valuation";
import { fmtINR, fmtNumber, fmtRatioPct } from "@/lib/format";

export interface ValuationContext {
  symbol: string;
  name: string;
  status: string;
  price: number | null;
  eps: number | null;
  bvps: number | null;
  sharesCr: number | null;
  marketCapCr: number | null;
  fcfCr: number | null;
  netDebtCr: number | null;
  debtCr: number | null;
  dividendPerShare: number | null;
  peers: { name: string; pe: number | null; pb: number | null }[];
}

function safe<T>(fn: () => T): { value: T | null; error: string | null } {
  try {
    return { value: fn(), error: null };
  } catch (e) {
    const err = e as { issues?: { message: string; path: (string | number)[] }[]; message: string };
    return { value: null, error: err.issues ? err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") : err.message };
  }
}

function Num({
  label,
  value,
  onChange,
  suffix,
  step = "any",
  sourced,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  step?: string;
  sourced?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1" title={hint}>
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
        {label}
        {sourced ? <Badge tone="info">sourced</Badge> : null}
      </span>
      <span className="flex items-center rounded border border-line-strong bg-bg focus-within:border-accent">
        <input
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
          className="num h-8 w-full min-w-0 bg-transparent px-2.5 text-[12.5px] text-fg focus:outline-none"
        />
        {suffix ? <span className="pr-2 text-[11px] text-faint">{suffix}</span> : null}
      </span>
    </label>
  );
}

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-panel border border-line bg-panel", className)}>
      <h2 className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">{title}</h2>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Formula({ children }: { children: ReactNode }) {
  return <p className="mt-3 rounded bg-bg px-2.5 py-1.5 font-mono text-[11px] text-muted">{children}</p>;
}

const pct = (x: number) => x / 100;

/* -------------------------------- DCF -------------------------------- */

function DcfTool({ ctx }: { ctx: ValuationContext | null }) {
  const [fcf0, setFcf0] = useState(ctx?.fcfCr ? Math.round(ctx.fcfCr) : 1000);
  const [growth, setGrowth] = useState(10);
  const [years, setYears] = useState(5);
  const [rf, setRf] = useState(7);
  const [beta, setBeta] = useState(1);
  const [erp, setErp] = useState(6);
  const [kd, setKd] = useState(9);
  const [tax, setTax] = useState(25.17);
  const [tg, setTg] = useState(5);
  const [method, setMethod] = useState<"gordon" | "multiple">("gordon");
  const [exitMult, setExitMult] = useState(15);
  const [netDebt, setNetDebt] = useState(ctx?.netDebtCr != null ? Math.round(ctx.netDebtCr) : 0);
  const [shares, setShares] = useState(ctx?.sharesCr != null ? +ctx.sharesCr.toFixed(4) : 100);
  const [midYear, setMidYear] = useState(false);

  const ke = safe(() => capmCostOfEquity({ riskFreeRate: pct(rf), beta, equityRiskPremium: pct(erp) }));
  const w = safe(() =>
    wacc({ equityValue: ctx?.marketCapCr ?? 1, debtValue: ctx?.debtCr ?? 0, costOfEquity: ke.value ?? 0, costOfDebt: pct(kd), taxRate: pct(tax) }),
  );
  const flows = useMemo(() => Array.from({ length: Math.max(1, Math.min(30, Math.round(years) || 1)) }, (_, i) => fcf0 * (1 + pct(growth)) ** (i + 1)), [fcf0, growth, years]);
  const input = { cashFlows: flows, discountRate: w.value?.wacc ?? Number.NaN, terminalMethod: method, terminalGrowth: pct(tg), exitMultiple: exitMult, netDebt, sharesOutstanding: shares, midYear };
  const res = safe(() => dcf(input));
  const rates = w.value ? [-2, -1, 0, 1, 2].map((d) => +(w.value!.wacc + d / 100).toFixed(4)) : [];
  const gs = [-1, -0.5, 0, 0.5, 1].map((d) => +(pct(tg) + d / 100).toFixed(4));
  const grid = res.value && method === "gordon" ? dcfSensitivity(input, rates, gs) : null;
  const upside = res.value && ctx?.price ? res.value.perShare / ctx.price - 1 : null;

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card title="Assumptions">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Num label="Base-year FCF" value={fcf0} onChange={setFcf0} suffix="₹ cr" sourced={ctx?.fcfCr != null} hint="Latest free cash flow from the dataset, if available" />
          <Num label="FCF growth" value={growth} onChange={setGrowth} suffix="%/yr" />
          <Num label="Forecast years" value={years} onChange={setYears} step="1" />
          <Num label="Risk-free rate" value={rf} onChange={setRf} suffix="%" hint="e.g. 10-year government bond yield — your assumption" />
          <Num label="Beta" value={beta} onChange={setBeta} />
          <Num label="Equity risk premium" value={erp} onChange={setErp} suffix="%" />
          <Num label="Pre-tax cost of debt" value={kd} onChange={setKd} suffix="%" />
          <Num label="Tax rate" value={tax} onChange={setTax} suffix="%" />
          <Num label="Net debt" value={netDebt} onChange={setNetDebt} suffix="₹ cr" sourced={ctx?.netDebtCr != null} />
          <Num label="Shares outstanding" value={shares} onChange={setShares} suffix="cr" sourced={ctx?.sharesCr != null} />
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted">Terminal value</span>
            <select value={method} onChange={(e) => setMethod(e.target.value as "gordon" | "multiple")} className="h-8 rounded border border-line-strong bg-bg px-2 text-[12.5px]">
              <option value="gordon">Gordon growth</option>
              <option value="multiple">Exit multiple</option>
            </select>
          </label>
          {method === "gordon" ? <Num label="Terminal growth" value={tg} onChange={setTg} suffix="%" /> : <Num label="Exit multiple" value={exitMult} onChange={setExitMult} suffix="× FCF" />}
          <label className="col-span-2 flex items-center gap-2 text-[12px] text-dim sm:col-span-3">
            <input type="checkbox" checked={midYear} onChange={(e) => setMidYear(e.target.checked)} className="accent-[var(--color-accent)]" />
            Mid-year discounting convention
          </label>
        </div>
        <Formula>
          Ke = Rf + β × ERP = {ke.value != null ? fmtRatioPct(ke.value) : "—"} · WACC = E/V·Ke + D/V·Kd·(1−t) = {w.value ? fmtRatioPct(w.value.wacc) : "—"}
          {ctx ? ` (E = market cap, D = total debt from the dataset)` : " (E/V assumed 100% without a company)"}
        </Formula>
      </Card>
      <div className="flex flex-col gap-3">
        <Card title="Result">
          {res.error || w.error || ke.error ? (
            <Callout tone="error">{res.error ?? w.error ?? ke.error}</Callout>
          ) : res.value ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Value per share" value={fmtINR(res.value.perShare)} sub={upside != null ? <span className={upside >= 0 ? "text-up" : "text-down"}>{fmtRatioPct(upside, 1, true)} vs price</span> : null} />
                <Stat label="Enterprise value" value={`₹${fmtNumber(res.value.enterpriseValue, 0)} cr`} />
                <Stat label="Equity value" value={`₹${fmtNumber(res.value.equityValue, 0)} cr`} />
                <Stat label="Terminal share of EV" value={fmtRatioPct(res.value.terminalShare, 1)} hint="High values mean the result depends mostly on the terminal assumption" />
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Year</th>
                      {res.value.rows.map((r) => (
                        <th key={r.year} className="r">
                          {r.year}
                        </th>
                      ))}
                      <th className="r">Terminal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">FCF (₹ cr)</th>
                      {res.value.rows.map((r) => (
                        <td key={r.year} className="r num">
                          {fmtNumber(r.cashFlow, 0)}
                        </td>
                      ))}
                      <td className="r num">{fmtNumber(res.value.terminalValue, 0)}</td>
                    </tr>
                    <tr>
                      <th scope="row">Present value</th>
                      {res.value.rows.map((r) => (
                        <td key={r.year} className="r num">
                          {fmtNumber(r.presentValue, 0)}
                        </td>
                      ))}
                      <td className="r num">{fmtNumber(res.value.pvTerminal, 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </Card>
        {grid ? (
          <Card title="Sensitivity — value per share (₹)">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>WACC ↓ / g →</th>
                    {gs.map((g) => (
                      <th key={g} className="r">
                        {fmtRatioPct(g, 1)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.map((row, i) => (
                    <tr key={rates[i]}>
                      <th scope="row">{fmtRatioPct(rates[i]!, 1)}</th>
                      {row.map((v, j) => (
                        <td key={j} className={cn("r num", i === 2 && j === 2 && "bg-accent-soft text-accent-strong", v != null && ctx?.price ? (v >= ctx.price ? "text-up" : "text-down") : "")}>
                          {v == null ? "n/a" : fmtNumber(v, 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10.5px] text-faint">Green/red compares each value with the current price. n/a where WACC ≤ growth (Gordon model undefined).</p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

/* ----------------------------- DDM & multiples ----------------------- */

function DdmTool({ ctx }: { ctx: ValuationContext | null }) {
  const [d0, setD0] = useState(ctx?.dividendPerShare ?? 10);
  const [g, setG] = useState(6);
  const [r, setR] = useState(12);
  const [hg, setHg] = useState(12);
  const [hy, setHy] = useState(5);
  const one = safe(() => gordonDdm({ currentDividend: d0, growth: pct(g), requiredReturn: pct(r) }));
  const two = safe(() => twoStageDdm(d0, pct(hg), Math.round(hy), pct(g), pct(r)));
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="Dividend discount model">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Num label="Current dividend / share" value={d0} onChange={setD0} suffix="₹" sourced={ctx?.dividendPerShare != null} />
          <Num label="Stable growth" value={g} onChange={setG} suffix="%" />
          <Num label="Required return" value={r} onChange={setR} suffix="%" />
          <Num label="High growth (stage 1)" value={hg} onChange={setHg} suffix="%" />
          <Num label="Stage 1 years" value={hy} onChange={setHy} step="1" />
        </div>
        <Formula>Gordon: P = D₀(1+g) / (r − g). Two-stage: PV of stage-1 dividends + PV of Gordon value at end of stage 1.</Formula>
      </Card>
      <Card title="Result">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Gordon value" value={one.value ? fmtINR(one.value.value) : "—"} sub={one.error ? <span className="text-down">{one.error}</span> : null} />
          <Stat label="Two-stage value" value={two.value ? fmtINR(two.value.value) : "—"} sub={two.error ? <span className="text-down">{two.error}</span> : null} />
          {ctx?.price ? <Stat label={`${ctx.symbol} price`} value={fmtINR(ctx.price)} /> : null}
        </div>
      </Card>
    </div>
  );
}

function MultiplesTool({ ctx }: { ctx: ValuationContext | null }) {
  const [eps, setEps] = useState(ctx?.eps ?? 50);
  const [bvps, setBvps] = useState(ctx?.bvps ?? 300);
  const [peers, setPeers] = useState(ctx?.peers.length ? ctx.peers : [{ name: "Peer A", pe: 20, pb: 3 }, { name: "Peer B", pe: 25, pb: 4 }]);
  const pe = impliedValueFromMultiples(eps, peers.map((p) => ({ name: p.name, value: p.pe })));
  const pb = impliedValueFromMultiples(bvps, peers.map((p) => ({ name: p.name, value: p.pb })));
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="Comparable-company multiples">
        <div className="mb-3 grid grid-cols-2 gap-3">
          <Num label="EPS" value={eps} onChange={setEps} suffix="₹" sourced={ctx?.eps != null} />
          <Num label="Book value / share" value={bvps} onChange={setBvps} suffix="₹" sourced={ctx?.bvps != null} />
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Peer</th>
              <th className="r">P/E</th>
              <th className="r">P/B</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {peers.map((p, i) => (
              <tr key={i}>
                <td>
                  <input value={p.name} onChange={(e) => setPeers((ps) => ps.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} className="h-6 w-full bg-transparent text-[12px] focus:outline-none" aria-label="Peer name" />
                </td>
                {(["pe", "pb"] as const).map((k) => (
                  <td key={k} className="r">
                    <input
                      type="number"
                      step="any"
                      value={p[k] ?? ""}
                      onChange={(e) => setPeers((ps) => ps.map((x, j) => (j === i ? { ...x, [k]: e.target.value === "" ? null : Number(e.target.value) } : x)))}
                      className="num h-6 w-20 rounded border border-line bg-bg px-1 text-right text-[12px]"
                      aria-label={`${p.name} ${k}`}
                    />
                  </td>
                ))}
                <td>
                  <button type="button" onClick={() => setPeers((ps) => ps.filter((_, k) => k !== i))} className="rounded p-1 text-faint hover:text-down" aria-label="Remove peer">
                    <X className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className={cn(buttonClass("ghost", "sm"), "mt-2")} onClick={() => setPeers((ps) => [...ps, { name: `Peer ${ps.length + 1}`, pe: null, pb: null }])}>
          <Plus className="size-3.5" /> Add peer
        </button>
        {ctx?.peers.length ? <p className="mt-2 text-[10.5px] text-faint">Peers pre-filled from the active dataset ({ctx.status}). Blank or negative multiples are excluded.</p> : null}
      </Card>
      <Card title="Implied value per share">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="P/E — median" value={pe ? fmtINR(pe.impliedAtMedian) : "—"} sub={pe ? <span className="text-muted">{pe.medianMultiple.toFixed(1)}× · range {fmtINR(pe.low, 0)}–{fmtINR(pe.high, 0)}</span> : "Needs peers"} />
          <Stat label="P/B — median" value={pb ? fmtINR(pb.impliedAtMedian) : "—"} sub={pb ? <span className="text-muted">{pb.medianMultiple.toFixed(1)}× · range {fmtINR(pb.low, 0)}–{fmtINR(pb.high, 0)}</span> : "Needs peers"} />
          <Stat label="P/E — mean" value={pe ? fmtINR(pe.impliedAtMean) : "—"} />
          <Stat label="P/B — mean" value={pb ? fmtINR(pb.impliedAtMean) : "—"} />
        </div>
        {ctx?.price ? <p className="mt-3 text-[12px] text-dim">Current price {fmtINR(ctx.price)} · current P/E {ctx.eps ? (ctx.price / ctx.eps).toFixed(1) : "—"}×</p> : null}
        <Formula>Implied value = company metric × peer multiple</Formula>
      </Card>
    </div>
  );
}

/* ------------------------- Personal finance tools ---------------------- */

function GrowthTools() {
  const [s, setS] = useState(100000);
  const [e, setE] = useState(250000);
  const [y, setY] = useState(7);
  const [p, setP] = useState(500000);
  const [r, setR] = useState(7.5);
  const [cy, setCy] = useState(10);
  const [n, setN] = useState(4);
  const [contrib, setContrib] = useState(0);
  const c = safe(() => cagr(s, e, y));
  const ci = safe(() => compoundInterest({ principal: p, annualRate: pct(r), years: cy, compoundsPerYear: Math.round(n), periodicContribution: contrib }));
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="CAGR">
        <div className="grid grid-cols-3 gap-3">
          <Num label="Start value" value={s} onChange={setS} suffix="₹" />
          <Num label="End value" value={e} onChange={setE} suffix="₹" />
          <Num label="Years" value={y} onChange={setY} />
        </div>
        <div className="mt-3">
          <Stat label="Compound annual growth rate" value={c.value != null ? fmtRatioPct(c.value, 2) : "—"} sub={c.error ? <span className="text-down">{c.error}</span> : null} />
        </div>
        <Formula>CAGR = (End / Start)^(1 / years) − 1</Formula>
      </Card>
      <Card title="Compound interest">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Num label="Principal" value={p} onChange={setP} suffix="₹" />
          <Num label="Annual rate" value={r} onChange={setR} suffix="%" />
          <Num label="Years" value={cy} onChange={setCy} />
          <Num label="Compounds per year" value={n} onChange={setN} step="1" />
          <Num label="Contribution per period" value={contrib} onChange={setContrib} suffix="₹" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="Future value" value={ci.value ? fmtINR(ci.value.futureValue, 0) : "—"} sub={ci.error ? <span className="text-down">{ci.error}</span> : null} />
          <Stat label="Invested" value={ci.value ? fmtINR(ci.value.invested, 0) : "—"} />
          <Stat label="Interest" value={ci.value ? fmtINR(ci.value.interestEarned, 0) : "—"} />
        </div>
        <Formula>FV = P(1 + r/n)^(n·t) + C·[((1 + r/n)^(n·t) − 1)/(r/n)]</Formula>
      </Card>
    </div>
  );
}

function SipTool() {
  const [m, setM] = useState(10000);
  const [r, setR] = useState(12);
  const [y, setY] = useState(15);
  const [step, setStep] = useState(0);
  const res = safe(() => sipProjection({ monthlyContribution: m, expectedAnnualReturn: pct(r), years: Math.round(y), annualStepUp: pct(step) }));
  const option = useMemo(
    () =>
      res.value
        ? {
            grid: { left: 70, right: 16, top: 28, bottom: 24 },
            tooltip: { trigger: "axis" },
            legend: { top: 0, textStyle: { color: "#b3bac1" } },
            xAxis: { type: "category", data: res.value.yearly.map((x) => `Y${x.year}`), ...axisStyle },
            yAxis: { type: "value", ...axisStyle },
            series: [
              { name: "Invested", type: "bar", data: res.value.yearly.map((x) => Math.round(x.invested)), itemStyle: { color: "#3a424a" } },
              { name: "Projected value", type: "line", data: res.value.yearly.map((x) => Math.round(x.value)), itemStyle: { color: "#4fb6b0" } },
            ],
          }
        : null,
    [res.value],
  );
  return (
    <div className="grid gap-3 lg:grid-cols-[360px_minmax(0,1fr)]">
      <Card title="SIP projection">
        <div className="grid grid-cols-2 gap-3">
          <Num label="Monthly SIP" value={m} onChange={setM} suffix="₹" />
          <Num label="Assumed return" value={r} onChange={setR} suffix="%/yr" />
          <Num label="Years" value={y} onChange={setY} step="1" />
          <Num label="Annual step-up" value={step} onChange={setStep} suffix="%" />
        </div>
        {res.error ? <Callout tone="error" className="mt-3">{res.error}</Callout> : null}
        {res.value ? (
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat label="Projected value" value={fmtINR(res.value.futureValue, 0)} />
            <Stat label="Invested" value={fmtINR(res.value.invested, 0)} />
            <Stat label="Gain" value={fmtINR(res.value.gain, 0)} />
          </div>
        ) : null}
        <Formula>Contributions at the start of each month, compounded monthly at r/12. A constant return is an assumption; real returns vary and can be negative.</Formula>
      </Card>
      <Card title="Year by year">{option ? <EChart option={option} height={300} ariaLabel="SIP projection by year" /> : null}</Card>
    </div>
  );
}

function BreakEvenTool() {
  const [f, setF] = useState(500000);
  const [p, setP] = useState(250);
  const [v, setV] = useState(150);
  const res = safe(() => breakEven(f, p, v));
  return (
    <Card title="Break-even analysis">
      <div className="grid gap-3 sm:grid-cols-3">
        <Num label="Fixed costs" value={f} onChange={setF} suffix="₹" />
        <Num label="Price per unit" value={p} onChange={setP} suffix="₹" />
        <Num label="Variable cost per unit" value={v} onChange={setV} suffix="₹" />
      </div>
      {res.error ? <Callout tone="error" className="mt-3">{res.error}</Callout> : null}
      {res.value ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Break-even units" value={fmtNumber(Math.ceil(res.value.units), 0)} />
          <Stat label="Break-even revenue" value={fmtINR(res.value.revenue, 0)} />
          <Stat label="Contribution / unit" value={fmtINR(res.value.contributionMargin)} />
          <Stat label="Contribution margin" value={fmtRatioPct(res.value.contributionMarginRatio, 1)} />
        </div>
      ) : null}
      <Formula>Units = Fixed costs / (Price − Variable cost)</Formula>
    </Card>
  );
}

function ScenarioTool({ price }: { price: number | null }) {
  const [rows, setRows] = useState([
    { name: "Bear", probability: 25, value: price ? Math.round(price * 0.7) : 70 },
    { name: "Base", probability: 50, value: price ? Math.round(price * 1.05) : 105 },
    { name: "Bull", probability: 25, value: price ? Math.round(price * 1.4) : 140 },
  ]);
  const res = safe(() => scenarioAnalysis(rows.map((r) => ({ ...r, probability: r.probability / 100 }))));
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="Scenario analysis">
        <table className="data-table">
          <thead>
            <tr>
              <th>Scenario</th>
              <th className="r">Probability %</th>
              <th className="r">Value (₹)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <input value={r.name} onChange={(e) => setRows((xs) => xs.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} className="h-6 w-full bg-transparent text-[12px] focus:outline-none" aria-label="Scenario name" />
                </td>
                {(["probability", "value"] as const).map((k) => (
                  <td key={k} className="r">
                    <input
                      type="number"
                      step="any"
                      value={r[k]}
                      onChange={(e) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: Number(e.target.value) } : x)))}
                      className="num h-6 w-24 rounded border border-line bg-bg px-1 text-right text-[12px]"
                      aria-label={`${r.name} ${k}`}
                    />
                  </td>
                ))}
                <td>
                  <button type="button" onClick={() => setRows((xs) => xs.filter((_, k) => k !== i))} className="rounded p-1 text-faint hover:text-down" aria-label="Remove scenario">
                    <X className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className={cn(buttonClass("ghost", "sm"), "mt-2")} onClick={() => setRows((xs) => [...xs, { name: `Scenario ${xs.length + 1}`, probability: 0, value: 0 }])}>
          <Plus className="size-3.5" /> Add scenario
        </button>
      </Card>
      <Card title="Probability-weighted result">
        {res.error ? <Callout tone="error">{res.error}</Callout> : null}
        {res.value ? (
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Expected value" value={fmtINR(res.value.expectedValue)} sub={price ? <span className="text-muted">vs price {fmtINR(price)}</span> : null} />
            <Stat label="Std. deviation" value={fmtINR(res.value.standardDeviation)} />
            <Stat label="Lowest" value={fmtINR(res.value.min)} />
            <Stat label="Highest" value={fmtINR(res.value.max)} />
          </div>
        ) : null}
        <Formula>E[V] = Σ pᵢ·Vᵢ, with Σ pᵢ = 100%</Formula>
      </Card>
    </div>
  );
}

function ReturnsTool() {
  const [flows, setFlows] = useState([
    { date: "2023-01-02", amount: -100000 },
    { date: "2024-01-01", amount: -50000 },
    { date: "2026-09-30", amount: 190000 },
  ]);
  const r = safe(() => xirr([...flows].sort((a, b) => a.date.localeCompare(b.date))));
  const invested = -flows.filter((f) => f.amount < 0).reduce((s, f) => s + f.amount, 0);
  const received = flows.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="Portfolio returns (XIRR)">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th className="r">Cash flow (₹)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {flows.map((f, i) => (
              <tr key={i}>
                <td>
                  <input type="date" value={f.date} onChange={(e) => setFlows((xs) => xs.map((x, k) => (k === i ? { ...x, date: e.target.value } : x)))} className="h-6 rounded border border-line bg-bg px-1 text-[12px]" aria-label="Date" />
                </td>
                <td className="r">
                  <input type="number" step="any" value={f.amount} onChange={(e) => setFlows((xs) => xs.map((x, k) => (k === i ? { ...x, amount: Number(e.target.value) } : x)))} className="num h-6 w-32 rounded border border-line bg-bg px-1 text-right text-[12px]" aria-label="Amount" />
                </td>
                <td>
                  <button type="button" onClick={() => setFlows((xs) => xs.filter((_, k) => k !== i))} className="rounded p-1 text-faint hover:text-down" aria-label="Remove cash flow">
                    <X className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className={cn(buttonClass("ghost", "sm"), "mt-2")} onClick={() => setFlows((xs) => [...xs, { date: new Date().toISOString().slice(0, 10), amount: 0 }])}>
          <Plus className="size-3.5" /> Add cash flow
        </button>
        <p className="mt-2 text-[10.5px] text-faint">Negative = money invested, positive = money received or the current value. Sorted by date when calculating.</p>
      </Card>
      <Card title="Result">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="XIRR (annualised)" value={r.value != null ? fmtRatioPct(r.value, 2) : "—"} sub={r.error ? <span className="text-down">{r.error}</span> : r.value == null ? <span className="text-muted">needs inflows and outflows</span> : null} />
          <Stat label="Invested" value={fmtINR(invested, 0)} />
          <Stat label="Received / value" value={fmtINR(received, 0)} />
        </div>
        <Formula>XIRR solves Σ CFᵢ / (1 + r)^((dᵢ − d₀)/365) = 0 (Newton–Raphson with bisection fallback)</Formula>
      </Card>
    </div>
  );
}

const TABS = ["DCF", "Dividend discount", "Multiples", "Scenarios", "CAGR & compounding", "SIP", "Returns (XIRR)", "Break-even"] as const;

export function ValuationClient({ ctx }: { ctx: ValuationContext | null }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("DCF");
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Calculators" className="flex flex-wrap gap-1 rounded-panel border border-line bg-panel p-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("h-7 rounded px-3 text-[12px]", tab === t ? "bg-raised font-medium text-fg" : "text-muted hover:text-fg")}
          >
            {t}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "DCF" ? <DcfTool ctx={ctx} /> : null}
        {tab === "Dividend discount" ? <DdmTool ctx={ctx} /> : null}
        {tab === "Multiples" ? <MultiplesTool ctx={ctx} /> : null}
        {tab === "Scenarios" ? <ScenarioTool price={ctx?.price ?? null} /> : null}
        {tab === "CAGR & compounding" ? <GrowthTools /> : null}
        {tab === "SIP" ? <SipTool /> : null}
        {tab === "Returns (XIRR)" ? <ReturnsTool /> : null}
        {tab === "Break-even" ? <BreakEvenTool /> : null}
      </div>
    </div>
  );
}
