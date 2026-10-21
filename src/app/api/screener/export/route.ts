import { z } from "zod";
import { toCsv } from "@/lib/csv";
import { runScreen, SCREEN_FIELDS, ScreenConfigSchema } from "@/lib/finance/screener";
import { ApiError, csvResponse, parseQuery, route } from "@/lib/server/api";
import { getActiveSourceId } from "@/lib/server/context";
import { assertExportAllowed, MAX_EXPORT_ROWS } from "@/lib/server/export-policy";
import { getScreenRows } from "@/lib/services/analytics";

export const GET = route(
  async ({ req, db }) => {
    const { config: raw } = parseQuery(req, z.object({ config: z.string().max(8000) }));
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ApiError(400, "config must be JSON", "bad_config");
    }
    const config = ScreenConfigSchema.parse(parsed);
    const sourceId = getActiveSourceId();
    const policy = assertExportAllowed(sourceId);
    const rows = runScreen(await getScreenRows(db, sourceId), { ...config, page: 1, pageSize: 200 }).allRows.slice(0, MAX_EXPORT_ROWS);
    const cols = config.columns?.length ? SCREEN_FIELDS.filter((f) => config.columns!.includes(f.key)) : SCREEN_FIELDS;
    return csvResponse(
      `screener_${sourceId}.csv`,
      toCsv(rows, [
        { header: "symbol", value: (r) => r.symbol },
        { header: "exchange", value: (r) => r.exchange },
        { header: "name", value: (r) => r.name },
        { header: "sector", value: (r) => r.sector },
        ...cols.map((f) => ({ header: f.key, value: (r: (typeof rows)[number]) => r[f.key] })),
        { header: "data_status", value: (r) => r.dataStatus },
        { header: "as_of", value: (r) => r.asOf },
        { header: "source", value: () => policy.attribution ?? sourceId },
      ]),
    );
  },
  { heavy: true },
);
