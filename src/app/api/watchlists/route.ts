import { z } from "zod";
import { parseJson, route } from "@/lib/server/api";
import { createWatchlist, listWatchlists } from "@/lib/services/user-data";

export const GET = route(async ({ db, user }) => ({ watchlists: await listWatchlists(db, user.id) }));

export const POST = route(async ({ req, db, user }) => {
  const body = await parseJson(req, z.object({ name: z.string() }));
  return { watchlist: await createWatchlist(db, user.id, body) };
});
