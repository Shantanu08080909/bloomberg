import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BellPlus, NotebookPen } from "lucide-react";
import { InstrumentChart } from "@/components/InstrumentChart";
import { NewsList } from "@/components/NewsList";
import { StatementTable } from "@/components/Statements";
import { Badge, Callout, Change, DataUnavailable, KeyValue, LinkButton, Panel, StatusBadge } from "@/components/ui";
import { WatchlistButton } from "@/components/WatchlistButton";
import { requireUser } from "@/lib/auth/server";
import { addDays, addYears, formatIST, formatISTDate } from "@/lib/dates";
import { securityHref } from "@/lib/dto";
import { fmtCompact, fmtCrore, fmtMultiple, fmtNumber, fmtPct, fmtPrice } from "@/lib/format";
import { getActiveSourceId } from "@/lib/server/context";
import { db } from "@/lib/server/db";
import { listNews } from "@/lib/services/content";
import {
  getBars,
  getCorporateActions,
  getFundamentals,
  getIndexConstituents,
  getIndexMetadata,
  getInstrument,
  getLatestBarProvenance,
  getOtherListings,
  getPeers,
  getStatements,
  latestBarDate,
} from "@/lib/services/market";
import { listNotes, listWatchlists, watchlistsContaining } from "@/lib/services/user-data";

type Params = { exchange: string; symbol: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { symbol } = await params;
  return { title: decodeURIComponent(symbol) };
}

export default async function SecurityPage({ params }: { params: Promise<Params> }) {
  const user = await requireUser();
  const { exchange: ex, symbol: sym } = await params;
  const exchange = decodeURIComponent(ex).toUpperCase();
  const symbol = decodeURIComponent(sym).toUpperCase();
  const database = await db();
  const sourceId = getActiveSourceId();
  const inst = await getInstrument(database, sourceId, exchange, symbol);
  if (!inst) notFound();

  const last = await latestBarDate(database, sourceId);
  const isIndex = inst.instrumentType === "INDEX";
  const provenance = await getLatestBarProvenance(database, inst.id, sourceId);
  const [yearBars, fundamentals, statements, actions, peers, listings, news, notes, lists, containing, indexMeta, constituents] = await Promise.all([
    getBars(database, inst.id, sourceId, last ? addYears(last, -1) : null),
    getFundamentals(database, inst.id, sourceId),
    getStatements(database, inst.id, sourceId),
    getCorporateActions(database, sourceId, { instrumentId: inst.id, limit: 20 }),
    getPeers(database, inst),
    getOtherListings(database, inst),
    listNews(database, { ticker: inst.symbol, limit: 8, savedBy: user.id }),
    listNotes(database, user.id, { instrumentId: inst.id }),
    listWatchlists(database, user.id),
    watchlistsContaining(database, user.id, inst.id),
    isIndex ? getIndexMetadata(database, inst.id) : Promise.resolve(null),
    isIndex ? getIndexConstituents(database, inst.id, sourceId) : Promise.resolve([]),
  ]);
  const q = inst.quote;
  const hi52 = yearBars.length ? Math.max(...yearBars.map((b) => b.high)) : null;
  const lo52 = yearBars.length ? Math.min(...yearBars.map((b) => b.low)) : null;
  const avgVol = yearBars.length ? yearBars.slice(-20).reduce((s, b) => s + b.volume, 0) / Math.min(20, yearBars.length) : null;
  const ret1y = yearBars.length > 1 ? (yearBars[yearBars.length - 1]!.close / yearBars[0]!.close - 1) * 100 : null;
  // Label windows honestly when less than a year of history is stored.
  const fullYear = last != null && yearBars.length > 0 && yearBars[0]!.date <= addDays(addYears(last, -1), 7);
  const since = yearBars[0] ? formatISTDate(yearBars[0].date) : null;
  const dividends = actions.filter((a) => a.action.actionType === "DIVIDEND");

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="num text-[20px] font-semibold tracking-tight">{inst.symbol}</h1>
            <Badge>{inst.exchange}</Badge>
            <Badge>{inst.instrumentType}</Badge>
            <StatusBadge status={inst.displayStatus} asOf={q?.asOf ? formatIST(q.asOf) : undefined} />
          </div>
          <p className="mt-0.5 text-[13px] text-dim">{inst.name}</p>
          <p className="mt-0.5 text-[11px] text-faint">
            {[inst.sector, inst.industry].filter(Boolean).join(" · ")}
            {inst.isin ? ` · ISIN ${inst.isin}` : ""}
            {inst.exchangeCode ? ` · BSE code ${inst.exchangeCode}` : ""} · {inst.currency}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-right">
            <div className="num text-[24px] font-medium leading-none">
              <span className="mr-1 text-[13px] text-muted">₹</span>
              {fmtPrice(q?.price)}
            </div>
            <Change value={q?.change} pct={q?.changePct} className="text-[13px]" />
            <div className="mt-0.5 text-[10.5px] text-faint">{q?.asOf ? `As of ${formatIST(q.asOf)} IST` : "No quote available"}</div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <WatchlistButton instrumentId={inst.id} watchlists={lists.map((l) => ({ id: l.id, name: l.name }))} containing={containing} />
            <LinkButton href={`/alerts?instrumentId=${inst.id}`} size="sm">
              <BellPlus className="size-3.5" aria-hidden /> Alert
            </LinkButton>
            <LinkButton href={`/notes?instrumentId=${inst.id}&new=1`} size="sm">
              <NotebookPen className="size-3.5" aria-hidden /> Note
            </LinkButton>
            <LinkButton href={`/technical?id=${inst.id}`} size="sm" variant="ghost">
              Technicals
            </LinkButton>
          </div>
        </div>
      </header>

      {inst.displayStatus === "demo" ? (
        <Callout tone="demo">{inst.description ?? "Demo instrument."} Prices, fundamentals and news on this page are synthetic.</Callout>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Price history">
          <InstrumentChart instrumentId={inst.id} label={inst.symbol} exportable height={380} />
        </Panel>
        <div className="flex flex-col gap-3">
          <Panel title="Trading">
            <KeyValue
              rows={[
                ["Open", fmtPrice(q?.open)],
                ["Day high / low", `${fmtPrice(q?.high)} / ${fmtPrice(q?.low)}`],
                ["Previous close", fmtPrice(q?.prevClose)],
                ["Volume", fmtCompact(q?.volume)],
                ["Avg volume (20d)", fmtCompact(avgVol)],
                [fullYear ? "52-week high" : `High since ${since}`, fmtPrice(hi52)],
                [fullYear ? "52-week low" : `Low since ${since}`, fmtPrice(lo52)],
                [fullYear ? "1-year return" : `Return since ${since}`, <Change key="r" pct={ret1y} />],
              ]}
            />
          </Panel>
          {provenance ? (
            <Panel title="Data provenance">
              <KeyValue
                rows={[
                  ["Source", provenance.format],
                  ["Label", <StatusBadge key="st" status={inst.displayStatus} />],
                  ["Latest session", formatISTDate(provenance.date)],
                  ["Imported", `${formatIST(provenance.importedAt)} IST`],
                  ["How", provenance.mode === "daily" ? "Daily update" : provenance.mode === "manual" ? "Manual import" : provenance.mode === "backfill" ? "Historical backfill" : "Archive import"],
                  ["File", <span key="f" className="block max-w-[170px] truncate" title={provenance.sourceUrl ?? provenance.fileName}>{provenance.fileName}</span>],
                ]}
              />
              <p className="mt-2 text-[10.5px] text-faint">Prices are as traded (not adjusted for splits or bonuses). Fundamentals are not part of exchange files.</p>
            </Panel>
          ) : null}
          {!isIndex ? (
            <Panel title="Key ratios" footer={fundamentals ? `Fundamentals as of ${formatISTDate(fundamentals.asOf)}` : undefined}>
              {fundamentals ? (
                <KeyValue
                  rows={[
                    ["Market cap", fmtCrore(fundamentals.marketCapCr)],
                    ["P/E", fmtMultiple(fundamentals.pe)],
                    ["P/B", fmtMultiple(fundamentals.pb)],
                    ["EPS (TTM)", fundamentals.eps != null ? `₹${fmtNumber(fundamentals.eps)}` : "—"],
                    ["ROE", fmtPct(fundamentals.roe, 2, false)],
                    ["Debt / equity", fundamentals.debtToEquity != null ? fmtMultiple(fundamentals.debtToEquity, 2) : <DataUnavailable key="d" text="Not reported" />],
                    ["Dividend yield", fmtPct(fundamentals.dividendYield, 2, false)],
                    ["Revenue growth (YoY)", <Change key="rg" pct={fundamentals.revenueGrowth} />],
                    ["Profit growth (YoY)", <Change key="pg" pct={fundamentals.profitGrowth} />],
                  ]}
                />
              ) : (
                <DataUnavailable what="Fundamentals" />
              )}
            </Panel>
          ) : (
            <Panel title="Index details">
              <KeyValue
                rows={[
                  ["Family", indexMeta?.family ?? "—"],
                  ["Base value", fmtNumber(indexMeta?.baseValue)],
                  ["Base date", formatISTDate(indexMeta?.baseDate)],
                  ["Constituents", String(constituents.length)],
                ]}
              />
              <p className="mt-2 text-[11.5px] text-muted">{indexMeta?.methodology}</p>
            </Panel>
          )}
          {listings.length ? (
            <Panel title="Other listings">
              <ul className="text-[12.5px]">
                {listings.map((l) => (
                  <li key={l.id}>
                    <Link href={securityHref(l.exchange, l.symbol)} className="text-accent hover:underline">
                      {l.symbol} on {l.exchange}
                    </Link>
                    {l.exchangeCode ? <span className="text-faint"> · code {l.exchangeCode}</span> : null}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>

      {isIndex ? (
        <Panel title="Constituents" bodyClassName="p-0 overflow-x-auto max-h-[480px]">
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th className="r">Weight</th>
                <th className="r">Last</th>
                <th className="r">Chg %</th>
              </tr>
            </thead>
            <tbody>
              {constituents.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={securityHref(c.exchange, c.symbol)} className="num font-semibold text-accent-strong hover:underline">
                      {c.symbol}
                    </Link>
                  </td>
                  <td className="text-dim">{c.name}</td>
                  <td className="r num">{(c.weight * 100).toFixed(2)}%</td>
                  <td className="r num">{fmtPrice(c.quote?.price)}</td>
                  <td className="r num">
                    <Change pct={c.quote?.changePct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : (
        <>
          <Panel title="Financial statements" bodyClassName="p-0" actions={<LinkButton href={`/research?id=${inst.id}`} variant="ghost" size="sm">Full research</LinkButton>}>
            <StatementTable rows={statements} type="income" title="Income statement" />
          </Panel>
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Peers" bodyClassName="p-0 overflow-x-auto">
              {peers.length ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Peer</th>
                      <th className="r">Last</th>
                      <th className="r">Chg %</th>
                      <th className="r">Mkt cap</th>
                      <th className="r">P/E</th>
                      <th className="r">ROE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {peers.map((p) => (
                      <tr key={p.instrument.id}>
                        <td>
                          <Link href={securityHref(p.instrument.exchange, p.instrument.symbol)} className="num font-semibold text-accent-strong hover:underline">
                            {p.instrument.symbol}
                          </Link>
                        </td>
                        <td className="r num">{fmtPrice(p.quote?.price)}</td>
                        <td className="r num">
                          <Change pct={p.quote?.changePct} />
                        </td>
                        <td className="r num">{fmtCrore(p.f?.marketCapCr)}</td>
                        <td className="r num">{fmtMultiple(p.f?.pe)}</td>
                        <td className="r num">{fmtPct(p.f?.roe, 1, false)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-3 py-4 text-[12px] italic text-faint">Peer comparison unavailable: no sector peers in the active dataset.</p>
              )}
            </Panel>
            <Panel title="Dividends & corporate actions" bodyClassName="p-0 overflow-x-auto" actions={<LinkButton href={`/corporate-actions?symbol=${inst.symbol}`} variant="ghost" size="sm">All</LinkButton>}>
              {actions.length ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Ex-date</th>
                      <th>Type</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actions.map((a) => (
                      <tr key={a.action.id}>
                        <td className="num">{formatISTDate(a.action.exDate)}</td>
                        <td>
                          <Badge tone={a.action.actionType === "DIVIDEND" ? "up" : "info"}>{a.action.actionType}</Badge>
                        </td>
                        <td className="whitespace-normal text-dim">{a.action.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-3 py-4 text-[12px] italic text-faint">No corporate actions recorded for this instrument.</p>
              )}
              {dividends.length ? (
                <p className="border-t border-line px-3 py-1.5 text-[11px] text-muted">
                  {dividends.length} dividend{dividends.length > 1 ? "s" : ""} in the loaded history.
                </p>
              ) : null}
            </Panel>
          </div>
        </>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Related news" bodyClassName="p-0" actions={<LinkButton href={`/news?ticker=${inst.symbol}`} variant="ghost" size="sm">More</LinkButton>}>
          <NewsList items={news} compact />
        </Panel>
        <Panel title="Your notes" bodyClassName="p-0" actions={<LinkButton href={`/notes?instrumentId=${inst.id}&new=1`} variant="ghost" size="sm">New note</LinkButton>}>
          {notes.length ? (
            <ul className="divide-y divide-line">
              {notes.map((n) => (
                <li key={n.note.id} className="px-3 py-2">
                  <Link href={`/notes?id=${n.note.id}`} className="text-[12.5px] font-medium text-fg hover:text-accent-strong">
                    {n.note.title}
                  </Link>
                  <p className="line-clamp-2 text-[12px] text-muted">{n.note.body}</p>
                  <p className="mt-0.5 text-[10.5px] text-faint">Updated {formatIST(n.note.updatedAt)} IST</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-6 text-center text-[12px] text-muted">No notes linked to {inst.symbol} yet.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
