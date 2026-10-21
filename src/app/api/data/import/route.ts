import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { finishRun, startRun, upsertEconomicSeries } from "@/lib/ingest";
import { ApiError, parseJson, route } from "@/lib/server/api";
import { ImportSchema, parseObservationCsv } from "@/lib/services/datasets";

/**
 * Import an economic series from a CSV the user downloaded themselves (e.g. an
 * official RBI DBIE or MoSPI release). Stored with source "user".
 */
export const POST = route(
  async ({ req, db }) => {
    const body = await parseJson(req, ImportSchema);
    const [existing] = await db.select({ sourceId: s.economicSeries.sourceId }).from(s.economicSeries).where(eq(s.economicSeries.id, body.seriesId));
    if (existing && existing.sourceId !== "user") throw new ApiError(409, `Series ${body.seriesId} belongs to source "${existing.sourceId}" and cannot be overwritten by an import`, "conflict");
    const { observations, errors } = parseObservationCsv(body.csv);
    if (errors.length) throw new ApiError(400, `CSV problems: ${errors.join("; ")}`, "bad_csv");
    if (observations.length === 0) throw new ApiError(400, "CSV contains no observations", "bad_csv");
    const runId = await startRun(db, "user", `import:${body.seriesId}`);
    const n = await upsertEconomicSeries(db, "user", [
      {
        id: body.seriesId,
        name: body.name,
        country: body.country,
        category: body.category,
        unit: body.unit,
        frequency: body.frequency,
        sourceSeriesId: null,
        description: `User-imported. Source: ${body.sourceNote}`,
        publishedAt: null,
        observations,
      },
    ]);
    await finishRun(db, runId, "user", { status: "success", recordCount: n });
    return { imported: n, seriesId: body.seriesId };
  },
  { heavy: true },
);
