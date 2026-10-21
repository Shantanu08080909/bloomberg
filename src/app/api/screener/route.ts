import { fieldCoverage, runScreen, ScreenConfigSchema } from "@/lib/finance/screener";
import { parseJson, route } from "@/lib/server/api";
import { getActiveSourceId } from "@/lib/server/context";
import { getScreenRows } from "@/lib/services/analytics";

/** Server-side screening over the active source's universe. */
export const POST = route(async ({ req, db }) => {
  const config = await parseJson(req, ScreenConfigSchema);
  const rows = await getScreenRows(db, getActiveSourceId());
  const result = runScreen(rows, config);
  const asOf = rows.reduce<string | null>((m, r) => (r.asOf && (!m || r.asOf > m) ? r.asOf : m), null);
  return {
    total: result.total,
    universe: result.universe,
    page: result.page,
    pages: result.pages,
    rows: result.rows,
    coverage: fieldCoverage(rows),
    asOf,
    statuses: [...new Set(rows.map((r) => r.dataStatus))],
  };
});
