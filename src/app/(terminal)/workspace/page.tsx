import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/server";
import { toQuoteDTO } from "@/lib/dto";
import { getActiveSourceId, getShellStatus } from "@/lib/server/context";
import { db } from "@/lib/server/db";
import { portfolioSummaryDTO } from "@/lib/server/portfolio-dto";
import { latestObservations, listEconomicSeries, listNews } from "@/lib/services/content";
import { getAllFundamentals, getIndices, getMovers, listInstrumentsWithQuotes } from "@/lib/services/market";
import { DEFAULT_LAYOUT, listNotes, listPortfolios, listWatchlists, listWorkspaces, watchlistInstrumentIds, type WorkspaceLayout } from "@/lib/services/user-data";
import { WorkspaceClient, type WorkspaceData } from "./WorkspaceClient";

export const metadata: Metadata = { title: "Workspace Builder" };

export default async function WorkspacePage() {
  const user = await requireUser();
  const database = await db();
  const sourceId = getActiveSourceId();
  const [status, indices, movers, lists, news, series, portfolios, notes, workspaces, equities, fundamentals] = await Promise.all([
    getShellStatus(),
    getIndices(database, sourceId),
    getMovers(database, sourceId, 5),
    listWatchlists(database, user.id),
    listNews(database, { limit: 6, savedBy: user.id }),
    listEconomicSeries(database),
    listPortfolios(database, user.id),
    listNotes(database, user.id),
    listWorkspaces(database, user.id),
    listInstrumentsWithQuotes(database, sourceId, { types: ["EQUITY"], exchange: "NSE" }),
    getAllFundamentals(database, sourceId),
  ]);
  const watchlists = await Promise.all(
    lists.map(async (l) => {
      const ids = await watchlistInstrumentIds(database, user.id, l.id);
      const rows = ids.length ? await listInstrumentsWithQuotes(database, sourceId, { ids }) : [];
      return { id: l.id, name: l.name, items: rows.map(toQuoteDTO) };
    }),
  );
  const econIds = ["IN_POLICY_RATE", "IN_CPI_YOY", "IN_GDP_YOY", "IN_GSEC_10Y", "USDINR", "US_FED_FUNDS"].filter((id) => series.some((s) => s.id === id));
  const latest = await latestObservations(database, econIds.length ? econIds : series.slice(0, 6).map((s) => s.id));
  const pSummaries = await Promise.all(portfolios.map((p) => portfolioSummaryDTO(database, user.id, p.id)));
  const cap = new Map(fundamentals.map((f) => [f.instrumentId, f.marketCapCr]));
  const nifty = indices.find((i) => i.symbol === "NIFTY50") ?? indices[0];

  const data: WorkspaceData = {
    indices: indices.map(toQuoteDTO),
    gainers: movers.gainers.map(toQuoteDTO),
    losers: movers.losers.map(toQuoteDTO),
    watchlists,
    news: news.map((n) => ({ ...n, publishedAt: n.publishedAt.toISOString() })),
    economy: [...latest.entries()].map(([id, l]) => {
      const s = series.find((x) => x.id === id)!;
      return { id, name: s.name, value: l.latest?.value ?? null, previous: l.previous?.value ?? null, period: l.latest?.periodDate ?? null, sourceId: s.sourceId };
    }),
    portfolios: pSummaries.map((p) => ({ id: p.portfolio.id, name: p.portfolio.name, marketValue: p.totals.marketValue, unrealized: p.totals.unrealizedPnl, costBasis: p.totals.costBasis, positions: p.totals.openPositions })),
    heat: equities.filter((e) => cap.get(e.id) != null).map((e) => ({ symbol: e.symbol, exchange: e.exchange, name: e.name, sector: e.sector ?? "Other", marketCapCr: cap.get(e.id)!, changePct: e.quote?.changePct ?? null })),
    notes: notes.slice(0, 6).map((n) => ({ id: n.note.id, title: n.note.title, updatedAt: n.note.updatedAt.toISOString(), symbol: n.symbol })),
    defaultChart: nifty ? { id: nifty.id, symbol: nifty.symbol } : null,
  };

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Workspace Builder" subtitle="Arrange widgets into your own dashboard and save named layouts." />
      <WorkspaceClient
        data={data}
        saved={workspaces.map((w) => ({ id: w.id, name: w.name, layout: w.layout as unknown as WorkspaceLayout, isDefault: w.isDefault }))}
        defaultLayout={DEFAULT_LAYOUT}
        statusTone={status.tone}
      />
    </div>
  );
}
