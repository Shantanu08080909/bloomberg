import { z } from "zod";
import { toQuoteDTO } from "@/lib/dto";
import { intParam, parseJson, route } from "@/lib/server/api";
import { listInstrumentsWithQuotes } from "@/lib/services/market";
import { deleteWatchlist, getOwnedWatchlist, renameWatchlist, watchlistInstrumentIds } from "@/lib/services/user-data";
import * as s from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

export const GET = route<{ id: string }>(async ({ db, user, params }) => {
  const id = intParam(params.id);
  const wl = await getOwnedWatchlist(db, user.id, id);
  const ids = await watchlistInstrumentIds(db, user.id, id);
  // Items may come from different sources; read each with its own source.
  const sources = ids.length
    ? await db.select({ id: s.instruments.id, sourceId: s.instruments.sourceId }).from(s.instruments).where(inArray(s.instruments.id, ids))
    : [];
  const bySource = new Map<string, number[]>();
  for (const r of sources) bySource.set(r.sourceId, [...(bySource.get(r.sourceId) ?? []), r.id]);
  const rows = (await Promise.all([...bySource].map(([src, list]) => listInstrumentsWithQuotes(db, src, { ids: list })))).flat();
  const order = new Map(ids.map((x, i) => [x, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { watchlist: wl, items: rows.map(toQuoteDTO) };
});

export const PATCH = route<{ id: string }>(async ({ req, db, user, params }) => {
  const body = await parseJson(req, z.object({ name: z.string() }));
  return { watchlist: await renameWatchlist(db, user.id, intParam(params.id), body) };
});

export const DELETE = route<{ id: string }>(async ({ db, user, params }) => {
  await deleteWatchlist(db, user.id, intParam(params.id));
  return { ok: true };
});
