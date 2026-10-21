import { z } from "zod";
import { route } from "@/lib/server/api";
import { refreshSource, syncSourceConfiguration } from "@/lib/services/refresh";

const Id = z.enum(["demo", "alphavantage", "fred", "rss"]);

/** Manually trigger a refresh of one configured source. */
export const POST = route<{ id: string }>(
  async ({ db, params }) => {
    const id = Id.parse(params.id);
    await syncSourceConfiguration(db);
    return { outcome: await refreshSource(db, id) };
  },
  { heavy: true },
);
