import { eodExchanges } from "@/lib/config";
import { dailyUpdate } from "@/lib/eod/download";
import { ApiError, route } from "@/lib/server/api";
import { refreshEodFlag } from "@/lib/server/db";
import { requireOwner } from "@/lib/server/owner";

/** Incremental update: download sessions after the last imported one (requires EOD_DOWNLOAD_ENABLED=true). */
export const POST = route(
  async ({ db, user }) => {
    await requireOwner(db, user.id);
    try {
      const outcomes = await dailyUpdate(db, eodExchanges());
      await refreshEodFlag(db);
      return { outcomes: outcomes.map(({ results, ...o }) => ({ ...o, bars: results?.reduce((n, r) => n + r.barsWritten, 0) ?? 0 })) };
    } catch (err) {
      if (err instanceof Error && /disabled/.test(err.message)) throw new ApiError(400, err.message, "download_disabled");
      throw err;
    }
  },
  { heavy: true },
);
