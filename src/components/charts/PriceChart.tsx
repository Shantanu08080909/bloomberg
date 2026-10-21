"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type Time,
} from "lightweight-charts";
import type { Bar } from "@/lib/finance/aggregate";
import { fmtCompact, fmtPrice } from "@/lib/format";

export const CHART_COLORS = {
  bg: "#15181b",
  grid: "#20252a",
  text: "#7f8992",
  border: "#2a3036",
  up: "#3fb17d",
  down: "#e0605a",
  accent: "#4fb6b0",
  series: ["#6ea8fe", "#e2b13c", "#c48cf0", "#4fb6b0", "#f08c5a", "#9bd46a"],
};

export interface Overlay {
  name: string;
  values: (number | null)[];
  color: string;
  dashed?: boolean;
}

export interface Pane {
  name: string;
  height?: number;
  lines?: Overlay[];
  histogram?: { name: string; values: (number | null)[] };
  guides?: number[];
}

export function PriceChart({
  bars,
  type = "candles",
  overlays = [],
  panes = [],
  height = 380,
  showVolume = true,
  label,
}: {
  bars: Bar[];
  type?: "candles" | "line" | "area";
  overlays?: Overlay[];
  panes?: Pane[];
  height?: number;
  showVolume?: boolean;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [legend, setLegend] = useState<{ date: string; bar: Bar | null; values: { name: string; value: number | null; color: string }[] } | null>(null);

  const lastBar = bars[bars.length - 1] ?? null;
  const defaultLegend = useMemo(
    () =>
      lastBar
        ? {
            date: lastBar.date,
            bar: lastBar,
            values: overlays.map((o) => ({ name: o.name, value: o.values[o.values.length - 1] ?? null, color: o.color })),
          }
        : null,
    [lastBar, overlays],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || bars.length === 0) return;
    const totalPaneHeight = panes.reduce((s, p) => s + (p.height ?? 110), 0);
    const chart = createChart(el, {
      height: height + totalPaneHeight,
      autoSize: false,
      width: el.clientWidth,
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.bg },
        textColor: CHART_COLORS.text,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize: 11,
        panes: { separatorColor: CHART_COLORS.border, separatorHoverColor: CHART_COLORS.border },
        attributionLogo: true,
      },
      grid: { vertLines: { color: CHART_COLORS.grid }, horzLines: { color: CHART_COLORS.grid } },
      rightPriceScale: { borderColor: CHART_COLORS.border },
      timeScale: { borderColor: CHART_COLORS.border, timeVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      // An explicit locale avoids failures when the browser reports an invalid tag (e.g. "en-US@posix").
      localization: { locale: "en-IN", priceFormatter: (p: number) => fmtPrice(p) },
    });
    chartRef.current = chart;
    const time = (d: string) => d as Time;

    let main: ISeriesApi<SeriesType>;
    if (type === "candles") {
      main = chart.addSeries(CandlestickSeries, {
        upColor: CHART_COLORS.up,
        downColor: CHART_COLORS.down,
        borderVisible: false,
        wickUpColor: CHART_COLORS.up,
        wickDownColor: CHART_COLORS.down,
      });
      main.setData(bars.map((b) => ({ time: time(b.date), open: b.open, high: b.high, low: b.low, close: b.close })));
    } else if (type === "area") {
      main = chart.addSeries(AreaSeries, {
        lineColor: CHART_COLORS.accent,
        topColor: "rgba(79,182,176,0.28)",
        bottomColor: "rgba(79,182,176,0.02)",
        lineWidth: 2,
      });
      main.setData(bars.map((b) => ({ time: time(b.date), value: b.close })));
    } else {
      main = chart.addSeries(LineSeries, { color: CHART_COLORS.accent, lineWidth: 2 });
      main.setData(bars.map((b) => ({ time: time(b.date), value: b.close })));
    }

    if (showVolume) {
      const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vol.setData(
        bars.map((b, i) => ({
          time: time(b.date),
          value: b.volume,
          color: b.close >= (bars[i - 1]?.close ?? b.open) ? "rgba(63,177,125,0.35)" : "rgba(224,96,90,0.35)",
        })),
      );
    }

    const lineData = (values: (number | null)[]) =>
      bars.flatMap((b, i) => (values[i] != null && Number.isFinite(values[i]) ? [{ time: time(b.date), value: values[i] as number }] : []));

    const overlaySeries = overlays.map((o) => {
      const s = chart.addSeries(LineSeries, {
        color: o.color,
        lineWidth: 1,
        lineStyle: o.dashed ? LineStyle.Dashed : LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      s.setData(lineData(o.values));
      return s;
    });

    panes.forEach((p, idx) => {
      const paneIndex = idx + 1;
      if (p.histogram) {
        const h = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, paneIndex);
        h.setData(
          bars.flatMap((b, i) => {
            const v = p.histogram!.values[i];
            return v != null ? [{ time: time(b.date), value: v, color: v >= 0 ? "rgba(63,177,125,0.6)" : "rgba(224,96,90,0.6)" }] : [];
          }),
        );
      }
      for (const l of p.lines ?? []) {
        const s = chart.addSeries(LineSeries, { color: l.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: true }, paneIndex);
        s.setData(lineData(l.values));
        for (const gv of p.guides ?? []) s.createPriceLine({ price: gv, color: CHART_COLORS.border, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false });
      }
    });
    const chartPanes = chart.panes();
    panes.forEach((p, idx) => chartPanes[idx + 1]?.setHeight(p.height ?? 110));

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setLegend(null);
        return;
      }
      const d = String(param.time);
      const i = bars.findIndex((b) => b.date === d);
      setLegend({
        date: d,
        bar: i >= 0 ? bars[i]! : null,
        values: overlays.map((o, k) => {
          const pt = param.seriesData.get(overlaySeries[k]!) as { value?: number } | undefined;
          return { name: o.name, value: pt?.value ?? null, color: o.color };
        }),
      });
    });

    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [bars, type, overlays, panes, height, showVolume]);

  if (bars.length === 0) {
    return (
      <div className="grid place-items-center rounded border border-dashed border-line text-[12px] text-muted" style={{ height }}>
        No historical prices available for this range.
      </div>
    );
  }

  const L = legend ?? defaultLegend;
  const prev = L?.bar ? bars[bars.findIndex((b) => b.date === L.date) - 1] : undefined;
  const chg = L?.bar && prev ? L.bar.close - prev.close : null;
  return (
    <div className="relative">
      {L ? (
        <div className="pointer-events-none absolute left-2 top-1.5 z-10 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]" aria-live="off">
          {label ? <span className="font-semibold text-fg">{label}</span> : null}
          <span className="num text-muted">{L.date}</span>
          {L.bar ? (
            <span className="num text-dim">
              O <span className="text-fg">{fmtPrice(L.bar.open)}</span> H <span className="text-fg">{fmtPrice(L.bar.high)}</span> L{" "}
              <span className="text-fg">{fmtPrice(L.bar.low)}</span> C{" "}
              <span className={chg == null ? "text-fg" : chg >= 0 ? "text-up" : "text-down"}>{fmtPrice(L.bar.close)}</span> V{" "}
              <span className="text-fg">{fmtCompact(L.bar.volume)}</span>
            </span>
          ) : null}
          {L.values.map((v) => (
            <span key={v.name} className="num" style={{ color: v.color }}>
              {v.name} {fmtPrice(v.value)}
            </span>
          ))}
        </div>
      ) : null}
      <div ref={ref} className="w-full" role="img" aria-label={`${label ?? "Price"} chart, ${bars.length} bars from ${bars[0]!.date} to ${bars[bars.length - 1]!.date}`} />
    </div>
  );
}
