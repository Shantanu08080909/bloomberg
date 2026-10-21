import { z } from "zod";
import { parseQuery, route } from "@/lib/server/api";
import { getActiveSourceId } from "@/lib/server/context";
import { searchInstruments } from "@/lib/services/market";

const Query = z.object({ q: z.string().max(60).default(""), limit: z.coerce.number().int().min(1).max(50).default(10) });

export const GET = route(async ({ req, db }) => {
  const { q, limit } = parseQuery(req, Query);
  const rows = await searchInstruments(db, getActiveSourceId(), q, limit);
  return {
    results: rows.map((r) => ({
      id: r.id,
      symbol: r.symbol,
      exchange: r.exchange,
      name: r.name,
      instrumentType: r.instrumentType,
      price: r.quote?.price ?? null,
      changePct: r.quote?.changePct ?? null,
      status: r.displayStatus,
    })),
  };
});
