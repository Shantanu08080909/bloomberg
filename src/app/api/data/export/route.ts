import { toCsv } from "@/lib/csv";
import { ApiError, csvResponse, parseQuery, route } from "@/lib/server/api";
import { getActiveSourceId } from "@/lib/server/context";
import { assertExportAllowed, MAX_EXPORT_ROWS } from "@/lib/server/export-policy";
import { QuerySchema, runDatasetQuery } from "@/lib/services/datasets";

/** CSV export of one bounded query. Each source's export policy is enforced. */
export const GET = route(
  async ({ req, db }) => {
    const q = parseQuery(req, QuerySchema);
    const res = await runDatasetQuery(db, getActiveSourceId(), q, { limitOverride: MAX_EXPORT_ROWS });
    if (res.sourceIds.length === 0) throw new ApiError(404, "Nothing to export", "empty");
    const policies = res.sourceIds.map(assertExportAllowed);
    const attribution = policies.map((p) => p.attribution).filter(Boolean).join("; ");
    const body = toCsv(res.rows, [...res.columns.map((c) => ({ header: c, value: (r: Record<string, unknown>) => r[c] as string | number | null })), { header: "attribution", value: () => attribution }]);
    return csvResponse(`${q.dataset}${q.symbol ? `_${q.symbol}` : ""}${q.series ? `_${q.series}` : ""}.csv`, body);
  },
  { heavy: true },
);
