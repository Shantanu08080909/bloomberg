"use client";

import { useMemo, useState } from "react";
import { AreaChart, CandlestickChart, Download, LineChart, Loader2 } from "lucide-react";
import { PriceChart, type Overlay } from "@/components/charts/PriceChart";
import { downloadFile, useApi } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { RANGE_OPTIONS, type RangeOption } from "@/lib/dates";
import type { Bar } from "@/lib/finance/aggregate";
import { bollinger, ema, sma } from "@/lib/finance/indicators";

interface BarsResponse {
  bars: Bar[];
  status: string;
  instrument: { symbol: string; exchange: string; name: string };
}

export function SegButton<T extends string>({ value, options, onChange, label }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded border border-line bg-bg p-0.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onChange(o)}
          className={cn("h-6 rounded-[3px] px-2 text-[11px] font-medium", value === o ? "bg-raised text-fg" : "text-muted hover:text-fg")}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

const OVERLAY_DEFS = {
  "SMA 20": { color: "#6ea8fe", calc: (c: number[]) => sma(c, 20) },
  "SMA 50": { color: "#e2b13c", calc: (c: number[]) => sma(c, 50) },
  "SMA 200": { color: "#c48cf0", calc: (c: number[]) => sma(c, 200) },
  "EMA 21": { color: "#f08c5a", calc: (c: number[]) => ema(c, 21) },
} as const;
type OverlayKey = keyof typeof OVERLAY_DEFS | "Bollinger";

export function InstrumentChart({
  instrumentId,
  label,
  defaultRange = "1Y",
  height = 360,
  controls = "full",
  defaultType = "candles",
  exportable = false,
}: {
  instrumentId: number;
  label?: string;
  defaultRange?: RangeOption;
  height?: number;
  controls?: "full" | "compact";
  defaultType?: "candles" | "line" | "area";
  exportable?: boolean;
}) {
  const [range, setRange] = useState<RangeOption>(defaultRange);
  const [interval, setInterval] = useState<"D" | "W" | "M">("D");
  const [type, setType] = useState<"candles" | "line" | "area">(defaultType);
  const [overlayKeys, setOverlayKeys] = useState<OverlayKey[]>([]);
  const [exportError, setExportError] = useState<string | null>(null);
  const { data, error, loading } = useApi<BarsResponse>(`/api/instruments/${instrumentId}/bars?range=${range}&interval=${interval}`);

  const bars = useMemo(() => data?.bars ?? [], [data]);
  const overlays: Overlay[] = useMemo(() => {
    const closes = bars.map((b) => b.close);
    const out: Overlay[] = [];
    for (const k of overlayKeys) {
      if (k === "Bollinger") {
        const bb = bollinger(closes, 20, 2);
        out.push({ name: "BB up", values: bb.upper, color: "#7f8992", dashed: true }, { name: "BB mid", values: bb.middle, color: "#5b646c" }, { name: "BB low", values: bb.lower, color: "#7f8992", dashed: true });
      } else out.push({ name: k, values: OVERLAY_DEFS[k].calc(closes), color: OVERLAY_DEFS[k].color });
    }
    return out;
  }, [bars, overlayKeys]);

  const toggle = (k: OverlayKey) => setOverlayKeys((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SegButton label="Range" value={range} options={RANGE_OPTIONS} onChange={setRange} />
        {controls === "full" ? (
          <>
            <SegButton label="Interval" value={interval} options={["D", "W", "M"] as const} onChange={setInterval} />
            <div role="radiogroup" aria-label="Chart type" className="inline-flex rounded border border-line bg-bg p-0.5">
              {(
                [
                  ["candles", CandlestickChart, "Candlesticks"],
                  ["line", LineChart, "Line"],
                  ["area", AreaChart, "Area"],
                ] as const
              ).map(([t, Icon, name]) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={type === t}
                  aria-label={name}
                  title={name}
                  onClick={() => setType(t)}
                  className={cn("grid h-6 w-7 place-items-center rounded-[3px]", type === t ? "bg-raised text-fg" : "text-muted hover:text-fg")}
                >
                  <Icon className="size-3.5" />
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1" aria-label="Overlays">
              {([...Object.keys(OVERLAY_DEFS), "Bollinger"] as OverlayKey[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={overlayKeys.includes(k)}
                  onClick={() => toggle(k)}
                  className={cn(
                    "h-6 rounded border px-1.5 text-[10.5px]",
                    overlayKeys.includes(k) ? "border-accent/50 bg-accent-soft text-accent-strong" : "border-line text-muted hover:text-fg",
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {loading ? <Loader2 className="size-3.5 animate-spin text-muted" aria-label="Loading chart" /> : null}
          {exportable ? (
            <button
              type="button"
              className="flex h-6 items-center gap-1 rounded border border-line px-2 text-[11px] text-muted hover:text-fg"
              onClick={() => {
                setExportError(null);
                downloadFile(`/api/instruments/${instrumentId}/export?range=${range}`, "prices.csv").catch((e: Error) => setExportError(e.message));
              }}
            >
              <Download className="size-3" aria-hidden /> CSV
            </button>
          ) : null}
        </div>
      </div>
      {exportError ? <p className="text-[11px] text-down">{exportError}</p> : null}
      {error ? (
        <div className="grid place-items-center rounded border border-down/30 text-[12px] text-down" style={{ height }}>
          Could not load prices: {error}
        </div>
      ) : !data && loading ? (
        <div className="animate-pulse rounded bg-panel-2" style={{ height }} aria-busy="true" />
      ) : (
        <PriceChart bars={bars} type={type} overlays={overlays} height={height} label={label} />
      )}
    </div>
  );
}
