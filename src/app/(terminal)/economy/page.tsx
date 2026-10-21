import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Callout, Change, PageHeader, Panel } from "@/components/ui";
import { formatIST, formatISTDate } from "@/lib/dates";
import { db } from "@/lib/server/db";
import { getObservations, latestObservations, listEconomicSeries } from "@/lib/services/content";
import { EconomyCompare } from "./EconomyCompare";

export const metadata: Metadata = { title: "Economic Dashboard" };

const CATEGORY_LABEL: Record<string, string> = {
  rates: "Policy & money-market rates",
  inflation: "Inflation",
  growth: "Growth",
  production: "Industrial production",
  yields: "Government bond yields",
  fx: "Currency",
  labour: "Labour market",
};

const SOURCE_TONE = { demo: "demo", fred: "info", user: "neutral" } as const;

export default async function EconomyPage() {
  const database = await db();
  const series = await listEconomicSeries(database);
  const [latest, obs] = await Promise.all([latestObservations(database, series.map((s) => s.id)), getObservations(database, series.map((s) => s.id))]);
  const anyDemo = series.some((s) => s.sourceId === "demo");
  const groups = new Map<string, typeof series>();
  for (const s of series) {
    const key = `${s.country}|${s.category}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const countries = [...new Set(series.map((s) => s.country))];

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Economic Dashboard" subtitle="Macro indicators with their observation period, publication time and fetch time kept separate." />
      {anyDemo ? (
        <Callout tone="demo" title="Synthetic economic series">
          Series marked DEMO are generated locally and are not official RBI, MoSPI or US statistics. Configure <code>FRED_API_KEY</code> for FRED series, or import
          official releases you downloaded yourself via <Link href="/data" className="underline">Data Explorer → Import CSV</Link>.
        </Callout>
      ) : null}

      {countries.map((country) => (
        <Panel key={country} title={country} bodyClassName="p-0 overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Indicator</th>
                <th className="r">Latest</th>
                <th className="r">Previous</th>
                <th className="r">Change</th>
                <th>Observation period</th>
                <th>Published (source)</th>
                <th>Fetched</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {[...groups.entries()]
                .filter(([k]) => k.startsWith(`${country}|`))
                .flatMap(([k, list]) => [
                  <tr key={k}>
                    <td colSpan={8} className="!bg-panel-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-faint">
                      {CATEGORY_LABEL[k.split("|")[1]!] ?? k.split("|")[1]}
                    </td>
                  </tr>,
                  ...list.map((s) => {
                    const l = latest.get(s.id);
                    const change = l?.latest && l.previous ? l.latest.value - l.previous.value : null;
                    return (
                      <tr key={s.id}>
                        <td>
                          <span className="text-fg">{s.name}</span>
                          <span className="ml-1.5 text-[10.5px] text-faint">{s.unit}</span>
                        </td>
                        <td className="r num">{l?.latest ? l.latest.value.toFixed(2) : "—"}</td>
                        <td className="r num text-muted">{l?.previous ? l.previous.value.toFixed(2) : "—"}</td>
                        <td className="r num">
                          <Change value={change} />
                        </td>
                        <td className="num text-[11.5px] text-dim">{l?.latest ? `${formatISTDate(l.latest.periodDate)} (${s.frequency})` : "—"}</td>
                        <td className="num text-[11.5px] text-muted">{s.publishedAt ? formatIST(s.publishedAt) : "Not reported"}</td>
                        <td className="num text-[11.5px] text-muted">{s.fetchedAt ? formatIST(s.fetchedAt) : "—"}</td>
                        <td>
                          <Badge tone={SOURCE_TONE[s.sourceId as keyof typeof SOURCE_TONE] ?? "neutral"}>{s.sourceId === "demo" ? "DEMO" : s.sourceId.toUpperCase()}</Badge>
                        </td>
                      </tr>
                    );
                  }),
                ])}
            </tbody>
          </table>
        </Panel>
      ))}

      <Panel title="Historical comparison">
        <EconomyCompare
          series={series.map((s) => ({ id: s.id, name: s.name, country: s.country, unit: s.unit, sourceId: s.sourceId, points: obs.get(s.id) ?? [] }))}
          initial={["IN_CPI_YOY", "IN_POLICY_RATE", "US_CPI_YOY"]}
        />
      </Panel>
      <p className="text-[10.5px] text-faint">
        Observation period = the month or quarter a value describes. Published = when the source says it released the series. Fetched = when this application stored it.
      </p>
    </div>
  );
}
