import { z } from "zod";
import { parseJson, route } from "@/lib/server/api";
import { getActiveSourceId } from "@/lib/server/context";
import { getRiskReport } from "@/lib/services/analytics";

const Body = z.object({
  instrumentIds: z.array(z.number().int().positive()).min(1).max(30),
  weights: z.record(z.string(), z.number().min(0)).default({}),
  benchmarkId: z.number().int().positive().nullable().default(null),
  riskFreeRate: z.number().min(0).max(0.3).default(0.065),
  lookbackDays: z.number().int().min(60).max(1100).default(365),
});

export const POST = route(
  async ({ req, db }) => {
    const b = await parseJson(req, Body);
    const weights = Object.fromEntries(Object.entries(b.weights).map(([k, v]) => [Number(k), v]));
    return { report: await getRiskReport(db, getActiveSourceId(), b.instrumentIds, weights, b.benchmarkId, b.riskFreeRate, b.lookbackDays) };
  },
  { heavy: true },
);
