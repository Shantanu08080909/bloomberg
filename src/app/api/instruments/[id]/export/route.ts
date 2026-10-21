import { z } from "zod";
import { toCsv } from "@/lib/csv";
import { RANGE_OPTIONS, rangeStart } from "@/lib/dates";
import { csvResponse, intParam, notFound, parseQuery, route } from "@/lib/server/api";
import { assertExportAllowed, MAX_EXPORT_ROWS } from "@/lib/server/export-policy";
import { getBars, getInstrumentById, latestBarDate } from "@/lib/services/market";

const Query = z.object({ range: z.enum(RANGE_OPTIONS).default("1Y") });

export const GET = route<{ id: string }>(
  async ({ req, db, params }) => {
    const id = intParam(params.id);
    const { range } = parseQuery(req, Query);
    const inst = await getInstrumentById(db, id);
    if (!inst) throw notFound("Instrument");
    const policy = assertExportAllowed(inst.sourceId);
    const last = await latestBarDate(db, inst.sourceId);
    const bars = (await getBars(db, id, inst.sourceId, last ? rangeStart(range, last) : null)).slice(-MAX_EXPORT_ROWS);
    const body = toCsv(bars, [
        { header: "date", value: (b) => b.date },
        { header: "symbol", value: () => inst.symbol },
        { header: "exchange", value: () => inst.exchange },
        { header: "open", value: (b) => b.open },
        { header: "high", value: (b) => b.high },
        { header: "low", value: (b) => b.low },
        { header: "close", value: (b) => b.close },
        { header: "volume", value: (b) => b.volume },
        { header: "data_status", value: () => inst.displayStatus },
        { header: "source", value: () => policy.attribution ?? inst.sourceId },
      ]);
    return csvResponse(`${inst.symbol}_${inst.exchange}_${range}_${inst.displayStatus}.csv`, body);
  },
  { heavy: true },
);
