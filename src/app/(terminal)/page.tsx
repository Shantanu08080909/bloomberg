import Link from "next/link";
import { Breadth } from "@/components/Breadth";
import { IndexCards } from "@/components/IndexCards";
import { InstrumentChart } from "@/components/InstrumentChart";
import { MoversList } from "@/components/MoversList";
import { NewsList } from "@/components/NewsList";
import { QuoteTable } from "@/components/QuoteTable";
import { RefreshButton } from "@/components/RefreshButton";
import { Badge, Change, KeyValue, LinkButton, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth/server";
import { addDays, formatIST } from "@/lib/dates";
import { toQuoteDTO } from "@/lib/dto";
import { fmtINR, fmtRatioPct } from "@/lib/format";
import { getActiveSourceId, getShellStatus } from "@/lib/server/context";
import { db } from "@/lib/server/db";
import { portfolioSummaryDTO } from "@/lib/server/portfolio-dto";
import { listNews } from "@/lib/services/content";
import { getBarsForMany, getBreadth, getIndices, getMovers, latestBarDate, listInstrumentsWithQuotes } from "@/lib/services/market";
import { listEvents, listPortfolios, listWatchlists, watchlistInstrumentIds } from "@/lib/services/user-data";

export default async function DashboardPage() {
  const user = await requireUser();
  const database = await db();
  const sourceId = getActiveSourceId();
  const [status, indices, movers, equities, news, events, lists, portfolios, last] = await Promise.all([
    getShellStatus(),
    getIndices(database, sourceId),
    getMovers(database, sourceId, 6),
    listInstrumentsWithQuotes(database, sourceId, { types: ["EQUITY", "ETF"] }),
    listNews(database, { limit: 6, savedBy: user.id }),
    listEvents(database, user.id),
    listWatchlists(database, user.id),
    listPortfolios(database, user.id),
    latestBarDate(database, sourceId),
  ]);
  const sparks = await getBarsForMany(database, indices.map((i) => i.id), sourceId, last ? addDays(last, -90) : null);
  const nifty = indices.find((i) => i.symbol === "NIFTY50") ?? indices[0];
  const breadth = nifty ? await getBreadth(database, nifty.id, sourceId) : null;
  const firstList = lists[0];
  const watchIds = firstList ? await watchlistInstrumentIds(database, user.id, firstList.id) : [];
  const watchRows = watchIds.length ? await listInstrumentsWithQuotes(database, sourceId, { ids: watchIds }) : [];
  const portfolio = portfolios[0] ? await portfolioSummaryDTO(database, user.id, portfolios[0].id) : null;
  const recentEvents = events.slice(-6);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Dashboard"
        subtitle={
          <>
            {status.sourceName} · latest data {status.lastAsOf ? `${status.lastAsOf} IST` : "unavailable"}
          </>
        }
        status={<StatusBadge status={status.tone} />}
        actions={<RefreshButton />}
      />

      <IndexCards indices={indices} sparks={sparks} />

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel title={nifty ? `${nifty.name} — history` : "Index history"} className="xl:col-span-2">
          {nifty ? <InstrumentChart instrumentId={nifty.id} label={nifty.symbol} defaultType="area" height={300} controls="compact" /> : <p className="text-muted">Index data unavailable.</p>}
        </Panel>
        <div className="flex flex-col gap-3">
          <Panel title="Market breadth">
            <Breadth data={breadth} label={nifty?.name ?? "Index"} />
          </Panel>
          <Panel title="Data source status" actions={<LinkButton href="/providers" variant="ghost" size="sm">Details</LinkButton>}>
            <KeyValue
              rows={[
                ["Active source", status.sourceName],
                ["Status", <StatusBadge key="s" status={status.tone} />],
                ["Quotes loaded", status.quoteCount.toLocaleString("en-IN")],
                ["Latest data point", status.lastAsOf ? `${status.lastAsOf} IST` : "—"],
                ["Last provider error", status.lastError ? <span key="e" className="text-down">{status.lastError.slice(0, 40)}</span> : "None"],
              ]}
            />
          </Panel>
          <Panel title="Portfolio summary" actions={<LinkButton href="/portfolio" variant="ghost" size="sm">Open</LinkButton>}>
            {portfolio ? (
              portfolio.totals.openPositions === 0 && portfolio.transactions.length === 0 ? (
                <p className="text-[12px] text-muted">
                  <span className="text-dim">{portfolio.portfolio.name}</span> has no transactions yet.{" "}
                  <Link href="/portfolio" className="text-accent hover:underline">Record a paper trade</Link>.
                </p>
              ) : (
                <KeyValue
                  rows={[
                    ["Portfolio", portfolio.portfolio.name],
                    ["Market value", portfolio.totals.marketValue != null ? fmtINR(portfolio.totals.marketValue) : <span key="m" className="text-stale">Prices missing</span>],
                    ["Cost basis", fmtINR(portfolio.totals.costBasis)],
                    [
                      "Unrealised P&L",
                      <Change
                        key="u"
                        value={portfolio.totals.unrealizedPnl}
                        pct={portfolio.totals.unrealizedPnl != null && portfolio.totals.costBasis > 0 ? (portfolio.totals.unrealizedPnl / portfolio.totals.costBasis) * 100 : null}
                      />,
                    ],
                    ["Realised P&L", <Change key="r" value={portfolio.totals.realizedPnl} />],
                    ["Largest position", portfolio.concentration.weights[0] ? `${portfolio.concentration.weights[0].key} ${fmtRatioPct(portfolio.concentration.weights[0].weight, 1)}` : "—"],
                  ]}
                />
              )
            ) : (
              <p className="text-[12px] text-muted">No portfolio.</p>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Panel title="Top gainers" bodyClassName="p-0">
          <MoversList rows={movers.gainers} />
        </Panel>
        <Panel title="Top losers" bodyClassName="p-0">
          <MoversList rows={movers.losers} />
        </Panel>
        <Panel title="Most active (turnover)" bodyClassName="p-0">
          <MoversList rows={movers.active} metric="turnover" />
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel title="Securities" className="xl:col-span-2" bodyClassName="p-0" actions={<LinkButton href="/explorer" variant="ghost" size="sm">Explorer</LinkButton>}>
          <QuoteTable rows={equities.map(toQuoteDTO)} columns={["symbol", "name", "exchange", "sector", "price", "changePct", "volume"]} pageSize={12} initialSort={{ key: "volume", dir: "desc" }} caption="Securities" />
        </Panel>
        <Panel
          title={firstList ? `Watchlist — ${firstList.name}` : "Watchlist"}
          bodyClassName="p-0"
          actions={<LinkButton href="/watchlists" variant="ghost" size="sm">Manage</LinkButton>}
        >
          {watchRows.length ? (
            <MoversList rows={watchRows} />
          ) : (
            <p className="px-3 py-6 text-center text-[12px] text-muted">
              Your watchlist is empty. Open any security and use <span className="text-dim">Add to watchlist</span>, or press{" "}
              <kbd className="rounded border border-line px-1">/</kbd> to search.
            </p>
          )}
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Latest news" bodyClassName="p-0" actions={<LinkButton href="/news" variant="ghost" size="sm">All news</LinkButton>}>
          <NewsList items={news} compact />
        </Panel>
        <Panel title="Economic events" bodyClassName="p-0" actions={<LinkButton href="/calendar" variant="ghost" size="sm">Calendar</LinkButton>}>
          {recentEvents.length ? (
            <ul className="divide-y divide-line">
              {recentEvents.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-[12.5px]">
                  <time className="num w-36 shrink-0 text-[11px] text-muted">{formatIST(e.scheduledAt)}</time>
                  <span className="min-w-0 flex-1 truncate text-dim">{e.title}</span>
                  {e.isSample ? <Badge tone="demo">Sample</Badge> : e.userId ? <Badge>Yours</Badge> : null}
                  <Badge tone={e.importance === "high" ? "down" : e.importance === "medium" ? "info" : "neutral"}>{e.importance}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-6 text-center text-[12px] text-muted">No events. Add your own on the calendar.</p>
          )}
        </Panel>
      </div>
      <p className="text-[10.5px] text-faint">
        Times are shown in India Standard Time. Charts by TradingView Lightweight Charts. Nothing here is investment advice.
        {formatIST(new Date()) ? ` Rendered ${formatIST(new Date())} IST.` : ""}
      </p>
    </div>
  );
}
