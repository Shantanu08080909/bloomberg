import { z } from "zod";
import { toCsv } from "@/lib/csv";
import { csvResponse, intParam, parseQuery, route } from "@/lib/server/api";
import { portfolioSummaryDTO } from "@/lib/server/portfolio-dto";

const Query = z.object({ kind: z.enum(["transactions", "holdings"]).default("transactions") });

/** Exports the user's own ledger and holdings (user-entered data plus price status labels). */
export const GET = route<{ id: string }>(
  async ({ req, db, user, params }) => {
    const { kind } = parseQuery(req, Query);
    const s = await portfolioSummaryDTO(db, user.id, intParam(params.id));
    const name = s.portfolio.name.replace(/\s+/g, "_");
    if (kind === "transactions") {
      return csvResponse(
        `${name}_transactions.csv`,
        toCsv(s.transactions, [
          { header: "id", value: (t) => t.id },
          { header: "trade_date", value: (t) => t.tradeDate },
          { header: "type", value: (t) => t.type },
          { header: "symbol", value: (t) => t.symbol },
          { header: "exchange", value: (t) => t.exchange },
          { header: "quantity", value: (t) => t.quantity },
          { header: "price", value: (t) => t.price },
          { header: "fees", value: (t) => t.fees },
          { header: "dividend_amount", value: (t) => t.amount },
          { header: "split_ratio", value: (t) => t.splitRatio },
          { header: "notes", value: (t) => t.notes },
        ]),
      );
    }
    return csvResponse(
      `${name}_holdings.csv`,
      toCsv(s.positions, [
        { header: "symbol", value: (p) => p.symbol },
        { header: "exchange", value: (p) => p.exchange },
        { header: "quantity", value: (p) => p.quantity },
        { header: "average_cost", value: (p) => p.averageCost },
        { header: "cost_basis", value: (p) => p.costBasis },
        { header: "price", value: (p) => p.price },
        { header: "price_as_of", value: (p) => p.priceAsOf },
        { header: "price_status", value: (p) => p.priceStatus },
        { header: "market_value", value: (p) => p.marketValue },
        { header: "unrealized_pnl", value: (p) => p.unrealizedPnl },
        { header: "realized_pnl", value: (p) => p.realizedPnl },
        { header: "dividends", value: (p) => p.dividendIncome },
        { header: "fees", value: (p) => p.feesPaid },
      ]),
    );
  },
  { heavy: true },
);
