import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { addDays } from "@/lib/dates";
import type { Database } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { rollingVolatility, rsi, sma } from "@/lib/finance/indicators";

const lastValue = (xs: (number | null)[]) => {
  for (let i = xs.length - 1; i >= 0; i--) if (xs[i] != null && Number.isFinite(xs[i]!)) return xs[i]!;
  return null;
};

export interface Snapshot {
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  volatility30: number | null;
  avgVolume20: number | null;
  high52w: number | null;
  low52w: number | null;
  return1y: number | null;
}

/** Indicators the screener needs, from an instrument's daily bars (oldest first). Insufficient history → null. */
export function computeSnapshot(bars: { high: number; low: number; close: number; volume: number }[]): Snapshot {
  const closes = bars.map((b) => b.close);
  const last = (xs: (number | null)[], need: number) => (closes.length >= need ? lastValue(xs) : null);
  const year = bars.slice(-252);
  return {
    sma50: last(sma(closes, 50), 50),
    sma200: last(sma(closes, 200), 200),
    rsi14: closes.length > 14 ? lastValue(rsi(closes, 14)) : null,
    volatility30: closes.length > 30 ? lastValue(rollingVolatility(closes, 30)) : null,
    avgVolume20: bars.length >= 20 ? lastValue(sma(bars.map((b) => b.volume), 20)) : null,
    high52w: year.length >= 200 ? Math.max(...year.map((b) => b.high)) : null,
    low52w: year.length >= 200 ? Math.min(...year.map((b) => b.low)) : null,
    return1y: closes.length >= 252 ? closes[closes.length - 1]! / closes[closes.length - 252]! - 1 : null,
  };
}

/** Recompute technical snapshots for instruments of a source (all when ids is omitted). */
export async function refreshTechnicalSnapshots(db: Database, sourceId: string, ids?: number[]) {
  let list = ids;
  if (!list) {
    const rows = await db.select({ id: s.instruments.id }).from(s.instruments).where(eq(s.instruments.sourceId, sourceId));
    list = rows.map((r) => r.id);
  }
  if (list.length === 0) return 0;
  const [mx] = await db.select({ d: sql<string | null>`max(${s.priceBars.date})::text` }).from(s.priceBars).where(eq(s.priceBars.sourceId, sourceId));
  if (!mx?.d) return 0;
  const from = addDays(mx.d, -420);
  let n = 0;
  for (let i = 0; i < list.length; i += 250) {
    const chunk = list.slice(i, i + 250);
    const rows = await db
      .select({ id: s.priceBars.instrumentId, date: s.priceBars.date, high: s.priceBars.high, low: s.priceBars.low, close: s.priceBars.close, volume: s.priceBars.volume })
      .from(s.priceBars)
      .where(and(eq(s.priceBars.sourceId, sourceId), inArray(s.priceBars.instrumentId, chunk), gte(s.priceBars.date, from)))
      .orderBy(s.priceBars.instrumentId, s.priceBars.date);
    const byId = new Map<number, typeof rows>();
    for (const r of rows) { const _l = byId.get(r.id); if (_l) _l.push(r); else byId.set(r.id, [r]); }
    const values = [...byId].map(([id, bars]) => ({ instrumentId: id, sourceId, asOf: bars.at(-1)!.date, bars: bars.length, ...computeSnapshot(bars) }));
    if (values.length) {
      await db
        .insert(s.technicalSnapshots)
        .values(values)
        .onConflictDoUpdate({
          target: [s.technicalSnapshots.instrumentId, s.technicalSnapshots.sourceId],
          set: {
            asOf: sql`excluded.as_of`,
            bars: sql`excluded.bars`,
            sma50: sql`excluded.sma50`,
            sma200: sql`excluded.sma200`,
            rsi14: sql`excluded.rsi14`,
            volatility30: sql`excluded.volatility30`,
            avgVolume20: sql`excluded.avg_volume20`,
            high52w: sql`excluded.high_52w`,
            low52w: sql`excluded.low_52w`,
            return1y: sql`excluded.return_1y`,
          },
        });
      n += values.length;
    }
  }
  return n;
}

export async function snapshotCount(db: Database, sourceId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(s.technicalSnapshots).where(eq(s.technicalSnapshots.sourceId, sourceId));
  return Number(r?.n ?? 0);
}
