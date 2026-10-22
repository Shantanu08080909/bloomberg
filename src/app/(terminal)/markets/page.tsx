import type { Metadata } from "next";
import Link from "next/link";
import { Breadth } from "@/components/Breadth";
import { MarketHeatmap } from "@/components/charts/MarketHeatmap";
import { MoversList } from "@/components/MoversList";
import { RefreshButton } from "@/components/RefreshButton";
import { Change, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { securityHref, toQuoteDTO } from "@/lib/dto";
import { fmtPrice } from "@/lib/format";
import { getActiveSourceId, getShellStatus } from "@/lib/server/context";
import { db } from "@/lib/server/db";
import { getAllFundamentals, getBreadth, getExchangeBreadth, getIndexConstituents, getIndexMetadata, getIndices, getMovers, listInstrumentsWithQuotes } from "@/lib/services/market";
import { IndexConstituents } from "./IndexConstituents";

export const metadata: Metadata = { title: "Indian Markets" };

export default async function MarketsPage({ searchParams }: { searchParams: Promise<{ exchange?: string }> }) {
  const { exchange: exParam } = await searchParams;
  const exchange = exParam === "BSE" ? "BSE" : "NSE";
  const database = await db();
  const sourceId = getActiveSourceId();
  const [status, indices, equities, fundamentals, movers] = await Promise.all([
    getShellStatus(),
    getIndices(database, sourceId),
    listInstrumentsWithQuotes(database, sourceId, { types: ["EQUITY"], exchange }),
    getAllFundamentals(database, sourceId),
    getMovers(database, sourceId, 8, exchange),
  ]);
  const caps = new Map(fundamentals.map((f) => [f.instrumentId, f.marketCapCr]));
  const breadths = await Promise.all(indices.map((i) => getBreadth(database, i.id, sourceId)));
  const meta = await Promise.all(indices.map((i) => getIndexMetadata(database, i.id)));
  const constituents = await Promise.all(indices.map((i) => getIndexConstituents(database, i.id, sourceId)));

  // Sector performance: market-cap weighted average change.
  const sectors = new Map<string, { cap: number; weighted: number; n: number; adv: number }>();
  for (const e of equities) {
    const cap = caps.get(e.id);
    const pct = e.quote?.changePct;
    if (!e.sector || cap == null || pct == null) continue;
    const s = sectors.get(e.sector) ?? { cap: 0, weighted: 0, n: 0, adv: 0 };
    s.cap += cap;
    s.weighted += cap * pct;
    s.n++;
    if (pct > 0) s.adv++;
    sectors.set(e.sector, s);
  }
  const sectorRows = [...sectors.entries()].map(([name, s]) => ({ name, change: s.weighted / s.cap, n: s.n, adv: s.adv })).sort((a, b) => b.change - a.change);
  const maxAbs = Math.max(0.01, ...sectorRows.map((r) => Math.abs(r.change)));

  // Size tiles by market cap; when the source has no market caps (exchange files), use the session's traded value.
  const byCap = equities.some((e) => caps.get(e.id) != null);
  const latestTs = equities.reduce((m, e) => Math.max(m, e.quote?.asOf?.getTime() ?? 0), 0);
  const heat = equities
    .filter((e) => (byCap ? caps.get(e.id) != null : e.quote && e.quote.asOf.getTime() === latestTs && e.quote.volume))
    .map((e) => ({
      symbol: e.symbol,
      exchange: e.exchange,
      name: e.name,
      sector: e.sector ?? (e.series ? `Series ${e.series}` : "Unclassified"),
      marketCapCr: byCap ? caps.get(e.id)! : ((e.quote?.price ?? 0) * (e.quote?.volume ?? 0)) / 1e7,
      changePct: e.quote?.changePct ?? null,
    }))
    .sort((a, b) => b.marketCapCr - a.marketCapCr)
    .slice(0, 400);
  const exBreadth = breadths.some(Boolean) ? null : await getExchangeBreadth(database, sourceId, exchange);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Indian Markets"
        subtitle={`Indices, breadth and sector moves · ${status.sourceName}${status.lastAsOf ? ` · as of ${status.lastAsOf} IST` : ""}`}
        status={<StatusBadge status={status.tone} />}
        actions={
          <>
            <div className="inline-flex rounded border border-line bg-bg p-0.5" role="tablist" aria-label="Exchange">
              {(["NSE", "BSE"] as const).map((x) => (
                <Link
                  key={x}
                  href={`/markets?exchange=${x}`}
                  role="tab"
                  aria-selected={exchange === x}
                  className={`h-6 rounded-[3px] px-3 text-[11px] font-medium leading-6 ${exchange === x ? "bg-raised text-fg" : "text-muted hover:text-fg"}`}
                >
                  {x}
                </Link>
              ))}
            </div>
            <RefreshButton />
          </>
        }
      />

      <Panel title="Indices" bodyClassName="p-0 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Index</th>
              <th scope="col" className="r">Level</th>
              <th scope="col" className="r">Change</th>
              <th scope="col" className="r">Day range</th>
              <th scope="col" className="min-w-48">Breadth</th>
              <th scope="col">Methodology</th>
              <th scope="col">Data</th>
            </tr>
          </thead>
          <tbody>
            {indices.map((i, k) => (
              <tr key={i.id}>
                <td>
                  <Link href={securityHref(i.exchange, i.symbol)} className="font-semibold text-accent-strong hover:underline">
                    {i.name}
                  </Link>
                </td>
                <td className="r num">{fmtPrice(i.quote?.price)}</td>
                <td className="r num">
                  <Change value={i.quote?.change} pct={i.quote?.changePct} />
                </td>
                <td className="r num text-muted">
                  {fmtPrice(i.quote?.low)} – {fmtPrice(i.quote?.high)}
                </td>
                <td>
                  {breadths[k] ? (
                    <span className="num text-[11.5px]">
                      <span className="text-up">{breadths[k]!.advancers}▲</span> <span className="text-down">{breadths[k]!.decliners}▼</span>{" "}
                      <span className="text-faint">of {breadths[k]!.constituents}</span>
                    </span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
                <td className="max-w-[280px] truncate text-[11.5px] text-muted" title={meta[k]?.methodology}>
                  {meta[k]?.methodology ?? "—"}
                </td>
                <td>
                  <StatusBadge status={i.displayStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {indices.length === 0 ? <p className="px-3 py-6 text-center text-[12px] text-muted">The active data source does not provide index data.</p> : null}
      </Panel>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel
          title={byCap ? `${exchange} sector heatmap · size = market cap, colour = day change` : `${exchange} heatmap · top ${heat.length} by traded value, grouped by series`}
          className="xl:col-span-2"
          footer={byCap ? undefined : "Exchange files do not include market capitalisation or sectors, so tiles are sized by the latest session's traded value."}
        >
          <MarketHeatmap cells={heat} sizeLabel={byCap ? "Mkt cap" : "Traded value"} />
        </Panel>
        <div className="flex flex-col gap-3">
          <Panel title="Sector performance (cap-weighted)">
            {sectorRows.length ? (
              <ul className="flex flex-col gap-1.5">
                {sectorRows.map((r) => (
                  <li key={r.name} className="grid grid-cols-[120px_1fr_64px] items-center gap-2 text-[12px]">
                    <span className="truncate text-dim" title={`${r.adv} of ${r.n} advancing`}>
                      {r.name}
                    </span>
                    <span className="relative h-2 rounded bg-raised">
                      <span
                        className={`absolute top-0 h-2 rounded ${r.change >= 0 ? "left-1/2 bg-up" : "right-1/2 bg-down"}`}
                        style={{ width: `${(Math.abs(r.change) / maxAbs) * 50}%` }}
                      />
                    </span>
                    <Change pct={r.change} className="text-right" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-muted">Sector data unavailable.</p>
            )}
          </Panel>
          {exBreadth ? (
            <Panel title="Breadth">
              <Breadth data={exBreadth} label={`All ${exchange} equities, latest session`} />
            </Panel>
          ) : null}
          {indices[0] && !exBreadth ? (
            <Panel title="Breadth">
              <div className="flex flex-col gap-4">
                {indices.slice(0, 3).map((i, k) => (
                  <Breadth key={i.id} data={breadths[k] ?? null} label={i.name} />
                ))}
              </div>
            </Panel>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Panel title={`${exchange} gainers`} bodyClassName="p-0">
          <MoversList rows={movers.gainers} />
        </Panel>
        <Panel title={`${exchange} losers`} bodyClassName="p-0">
          <MoversList rows={movers.losers} />
        </Panel>
        <Panel title={`${exchange} most active`} bodyClassName="p-0">
          <MoversList rows={movers.active} metric="turnover" />
        </Panel>
      </div>

      <Panel title="Index constituents" bodyClassName="p-0">
        <IndexConstituents
          indices={indices.map((i, k) => ({
            id: i.id,
            name: i.name,
            rows: constituents[k]!.map((c) => ({ ...toQuoteDTO(c), weight: c.weight })),
          }))}
        />
      </Panel>
    </div>
  );
}
