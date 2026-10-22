import { z } from "zod";
import { downloadRange } from "@/lib/eod/download";
import { ApiError, parseJson, route } from "@/lib/server/api";
import { refreshEodFlag } from "@/lib/server/db";
import { requireOwner } from "@/lib/server/owner";

const Body = z
  .object({
    exchange: z.enum(["NSE", "BSE", "BOTH"]),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((b) => b.from <= b.to, { message: "Start date must be on or before end date", path: ["to"] });

export const POST = route(
  async ({ req, db, user }) => {
    await requireOwner(db, user.id);
    const b = await parseJson(req, Body);
    try {
      const outcomes = await downloadRange(db, { exchanges: b.exchange === "BOTH" ? ["NSE", "BSE"] : [b.exchange], from: b.from, to: b.to, mode: "backfill" });
      await refreshEodFlag(db);
      return { outcomes: outcomes.map(({ results, ...o }) => ({ ...o, bars: results?.reduce((n, r) => n + r.barsWritten, 0) ?? 0 })) };
    } catch (err) {
      if (err instanceof Error && /(disabled|limit per run)/.test(err.message)) throw new ApiError(400, err.message, "download_refused");
      throw err;
    }
  },
  { heavy: true },
);
