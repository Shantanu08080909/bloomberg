import "server-only";
import type { Database } from "@/lib/db/client";
import { getPortfolioSummary } from "@/lib/services/analytics";
import { getOwnedPortfolio } from "@/lib/services/user-data";

/** Serializable portfolio summary for client components. */
export async function portfolioSummaryDTO(db: Database, userId: string, portfolioId: number) {
  const portfolio = await getOwnedPortfolio(db, userId, portfolioId);
  const sum = await getPortfolioSummary(db, userId, portfolioId);
  return {
    portfolio: { id: portfolio.id, name: portfolio.name, benchmarkInstrumentId: portfolio.benchmarkInstrumentId },
    totals: sum.totals,
    issues: sum.issues,
    missingPrices: sum.missingPrices,
    statuses: sum.statuses,
    concentration: { hhi: sum.concentration.hhi, effectiveN: sum.concentration.effectiveN, bySector: sum.concentration.bySector, weights: sum.concentration.weights },
    positions: sum.positions
      .filter((p) => p.quantity > 0 || p.realizedPnl !== 0 || p.dividendIncome !== 0)
      .map((p) => ({
        instrumentId: p.instrumentId,
        symbol: p.instrument?.symbol ?? "?",
        exchange: p.instrument?.exchange ?? "?",
        name: p.instrument?.name ?? "Unknown instrument",
        sector: p.instrument?.sector ?? null,
        quantity: p.quantity,
        averageCost: p.averageCost,
        costBasis: p.costBasis,
        price: p.price,
        priceAsOf: p.priceAsOf?.toISOString() ?? null,
        priceStatus: p.priceStatus,
        marketValue: p.marketValue,
        unrealizedPnl: p.unrealizedPnl,
        unrealizedPct: p.unrealizedPct,
        realizedPnl: p.realizedPnl,
        dividendIncome: p.dividendIncome,
        feesPaid: p.feesPaid,
      })),
    transactions: sum.txRows.map((r) => ({ ...r.tx, createdAt: r.tx.createdAt.toISOString(), symbol: r.symbol, exchange: r.exchange, name: r.name })),
  };
}

export type PortfolioSummaryDTO = Awaited<ReturnType<typeof portfolioSummaryDTO>>;
