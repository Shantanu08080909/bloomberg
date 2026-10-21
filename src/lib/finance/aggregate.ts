export interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Interval = "D" | "W" | "M";

/** Monday of the ISO week containing `date` (YYYY-MM-DD). */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

/** Aggregate daily bars to weekly or monthly bars. The bar date is the first trading day in the period. */
export function aggregateBars(bars: Bar[], interval: Interval): Bar[] {
  if (interval === "D") return bars;
  const out: Bar[] = [];
  let key: string | null = null;
  for (const b of bars) {
    const k = interval === "W" ? weekStart(b.date) : b.date.slice(0, 7);
    if (k !== key) {
      out.push({ ...b });
      key = k;
    } else {
      const cur = out[out.length - 1]!;
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
    }
  }
  return out;
}
