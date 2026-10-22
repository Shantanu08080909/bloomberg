import { z } from "zod";
import { importTejYear } from "@/lib/eod/download";
import { ApiError, parseJson, route } from "@/lib/server/api";
import { refreshEodFlag } from "@/lib/server/db";
import { requireOwner } from "@/lib/server/owner";

const Body = z.object({
  exchange: z.enum(["NSE", "BSE"]),
  year: z.number().int().min(2010).max(2100),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Download one yearly TejHQ archive file (requires TEJ_ARCHIVE_ENABLED=true). */
export const POST = route(
  async ({ req, db, user }) => {
    await requireOwner(db, user.id);
    const b = await parseJson(req, Body);
    try {
      const results = await importTejYear(db, b.exchange, b.year, { from: b.from });
      await refreshEodFlag(db);
      return { results: results.map(({ instrumentIds, ...r }) => ({ ...r, instruments: instrumentIds.length })) };
    } catch (err) {
      if (err instanceof Error && /(disabled|request failed)/.test(err.message)) throw new ApiError(400, err.message, "tej_refused");
      throw err;
    }
  },
  { heavy: true },
);
