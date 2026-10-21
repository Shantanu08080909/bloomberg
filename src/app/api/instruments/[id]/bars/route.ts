import { z } from "zod";
import { RANGE_OPTIONS, rangeStart } from "@/lib/dates";
import { aggregateBars } from "@/lib/finance/aggregate";
import { intParam, notFound, parseQuery, route } from "@/lib/server/api";
import { getBars, getInstrumentById, latestBarDate } from "@/lib/services/market";

const Query = z.object({
  range: z.enum(RANGE_OPTIONS).default("1Y"),
  interval: z.enum(["D", "W", "M"]).default("D"),
});

export const GET = route<{ id: string }>(async ({ req, db, params }) => {
  const id = intParam(params.id);
  const { range, interval } = parseQuery(req, Query);
  const inst = await getInstrumentById(db, id);
  if (!inst) throw notFound("Instrument");
  const last = await latestBarDate(db, inst.sourceId);
  const from = last ? rangeStart(range, last) : null;
  const bars = await getBars(db, id, inst.sourceId, from);
  return {
    instrument: { id: inst.id, symbol: inst.symbol, exchange: inst.exchange, name: inst.name, sourceId: inst.sourceId },
    status: inst.displayStatus,
    range,
    interval,
    bars: aggregateBars(bars, interval),
  };
});
