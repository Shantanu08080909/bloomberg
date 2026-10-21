import { parseJson, route } from "@/lib/server/api";
import { getActiveSourceId } from "@/lib/server/context";
import { QuerySchema, runDatasetQuery } from "@/lib/services/datasets";

export const POST = route(async ({ req, db }) => {
  const q = await parseJson(req, QuerySchema);
  const res = await runDatasetQuery(db, getActiveSourceId(), q);
  return { ...res, page: q.page, pageSize: q.pageSize, pages: Math.max(1, Math.ceil(res.total / q.pageSize)) };
});
