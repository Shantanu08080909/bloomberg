import type { Metadata } from "next";
import { SeriesChart } from "@/components/charts/SeriesChart";
import { Badge, Callout, Change, KeyValue, PageHeader, Panel } from "@/components/ui";
import { formatISTDate } from "@/lib/dates";
import { db } from "@/lib/server/db";
import { getObservations, listEconomicSeries } from "@/lib/services/content";
import { YieldCurve } from "./YieldCurve";

export const metadata: Metadata = { title: "Yield and Rates" };

const CURVE: [string, string][] = [
  ["IN_TBILL_91D", "91D"],
  ["IN_GSEC_2Y", "2Y"],
  ["IN_GSEC_5Y", "5Y"],
  ["IN_GSEC_10Y", "10Y"],
  ["IN_GSEC_30Y", "30Y"],
];

type Obs = { periodDate: string; value: number | null };

function valueAtOrBefore(points: Obs[], date: string) {
  for (let i = points.length - 1; i >= 0; i--) if (points[i]!.periodDate <= date && points[i]!.value != null) return points[i]!.value!;
  return null;
}

export default async function RatesPage() {
  const database = await db();
  const series = await listEconomicSeries(database);
  const ids = series.map((s) => s.id);
  const obs = await getObservations(database, ids);
  const byId = new Map(series.map((s) => [s.id, s]));
  const pts = (id: string) => obs.get(id) ?? [];
  const has = (id: string) => byId.has(id) && pts(id).length > 0;
  const curveAvailable = CURVE.every(([id]) => has(id));
  const lastDate = curveAvailable ? pts("IN_GSEC_10Y").at(-1)!.periodDate : null;
  const yearAgo = lastDate ? `${Number(lastDate.slice(0, 4)) - 1}${lastDate.slice(4)}` : null;
  const curveNow = curveAvailable ? CURVE.map(([id]) => valueAtOrBefore(pts(id), lastDate!)) : [];
  const curvePrev = curveAvailable && yearAgo ? CURVE.map(([id]) => valueAtOrBefore(pts(id), yearAgo)) : [];
  const spread = has("IN_GSEC_10Y") && has("IN_GSEC_2Y") ? pts("IN_GSEC_10Y").map((p) => ({ periodDate: p.periodDate, value: p.value != null ? +(p.value - (valueAtOrBefore(pts("IN_GSEC_2Y"), p.periodDate) ?? Number.NaN)).toFixed(3) : null })) : [];
  const isDemo = CURVE.some(([id]) => byId.get(id)?.sourceId === "demo");
  const fredYields = series.filter((s) => s.sourceId === "fred" && s.category === "yields");
  const fx = series.filter((s) => s.category === "fx");
  const policy = byId.get("IN_POLICY_RATE");
  const lastPolicy = policy ? pts(policy.id).filter((p) => p.value != null).at(-1) : null;
  const prevPolicyChange = policy
    ? (() => {
        const p = pts(policy.id).filter((x) => x.value != null);
        for (let i = p.length - 1; i > 0; i--) if (p[i]!.value !== p[i - 1]!.value) return { date: p[i]!.periodDate, from: p[i - 1]!.value!, to: p[i]!.value! };
        return null;
      })()
    : null;

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Yield and Rates" subtitle="Government bond yield curve, policy rate, term spread and currency rates." status={isDemo ? <Badge tone="demo">Demo series</Badge> : undefined} />
      {isDemo ? <Callout tone="demo">Yield, policy-rate and FX series below are synthetic demo values, not RBI or market data.</Callout> : null}

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel title={`India government yield curve${lastDate ? ` · ${formatISTDate(lastDate)}` : ""}`} className="xl:col-span-2">
          {curveAvailable ? (
            <YieldCurve
              tenors={CURVE.map(([, t]) => t)}
              curves={[
                { name: `Latest (${formatISTDate(lastDate)})`, values: curveNow },
                ...(curvePrev.some((v) => v != null) ? [{ name: `One year earlier (${formatISTDate(yearAgo)})`, values: curvePrev }] : []),
              ]}
            />
          ) : (
            <p className="py-10 text-center text-[12px] text-muted">Yield curve unavailable: the required tenor series are not loaded.</p>
          )}
        </Panel>
        <Panel title="Policy rate">
          {policy && lastPolicy ? (
            <>
              <KeyValue
                rows={[
                  ["Current", `${lastPolicy.value!.toFixed(2)}%`],
                  ["As of", formatISTDate(lastPolicy.periodDate)],
                  ["Last change", prevPolicyChange ? `${formatISTDate(prevPolicyChange.date)}: ${prevPolicyChange.from.toFixed(2)}% → ${prevPolicyChange.to.toFixed(2)}%` : "—"],
                  ["10Y − 2Y spread", spread.length ? <Change key="s" value={spread.at(-1)!.value} /> : "—"],
                ]}
              />
              <div className="mt-3">
                <SeriesChart series={[{ name: policy.name, points: pts(policy.id), step: true }]} height={160} unit="%" ariaLabel="Policy rate history" />
              </div>
            </>
          ) : (
            <p className="text-[12px] text-muted">Policy rate series not loaded.</p>
          )}
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Yield history">
          <SeriesChart
            series={CURVE.filter(([id]) => has(id)).map(([id, t]) => ({ name: t, points: pts(id) }))}
            unit="%"
            ariaLabel="Government bond yields by tenor over time"
          />
        </Panel>
        <Panel title="Term spread (10Y − 2Y) and US 10Y">
          <SeriesChart
            series={[
              ...(spread.length ? [{ name: "India 10Y − 2Y (pp)", points: spread }] : []),
              ...(has("US_10Y") ? [{ name: "US 10Y (%)", points: pts("US_10Y"), dashed: true }] : []),
              ...fredYields.map((s) => ({ name: `${s.name} (FRED)`, points: pts(s.id), dashed: true })),
            ]}
            ariaLabel="Term spread history"
          />
        </Panel>
      </div>

      <Panel title="Currency rates">
        {fx.length ? (
          <SeriesChart series={fx.map((s) => ({ name: `${s.name}${s.sourceId === "fred" ? " (FRED)" : ""}`, points: pts(s.id) }))} ariaLabel="Currency rates" />
        ) : (
          <p className="text-[12px] text-muted">No currency series loaded.</p>
        )}
      </Panel>
    </div>
  );
}
