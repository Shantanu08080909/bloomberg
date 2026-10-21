"use client";

import { useMemo } from "react";
import { EChart, axisStyle } from "./EChart";

export interface SeriesInput {
  name: string;
  points: { periodDate: string; value: number | null }[];
  step?: boolean;
  dashed?: boolean;
}

/** Multi-series time-series line chart on a shared date axis. */
export function SeriesChart({ series, height = 280, unit, ariaLabel }: { series: SeriesInput[]; height?: number; unit?: string; ariaLabel: string }) {
  const option = useMemo(() => {
    const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.periodDate)))].sort();
    return {
      grid: { left: 52, right: 16, top: series.length > 1 ? 30 : 12, bottom: 48 },
      tooltip: { trigger: "axis", valueFormatter: (v: number | null) => (v == null ? "—" : `${v.toFixed(2)}${unit ? ` ${unit}` : ""}`) },
      legend: series.length > 1 ? { top: 0, textStyle: { color: "#b3bac1" }, type: "scroll" } : undefined,
      xAxis: { type: "category", data: dates, ...axisStyle },
      yAxis: { type: "value", scale: true, ...axisStyle },
      dataZoom: [{ type: "inside" }, { type: "slider", height: 16, bottom: 8, borderColor: "#2a3036", textStyle: { color: "#7f8992" } }],
      series: series.map((s) => {
        const m = new Map(s.points.map((p) => [p.periodDate, p.value]));
        return {
          name: s.name,
          type: "line",
          step: s.step ? "end" : undefined,
          showSymbol: false,
          connectNulls: true,
          lineStyle: { width: 1.6, type: s.dashed ? "dashed" : "solid" },
          data: dates.map((d) => m.get(d) ?? null),
        };
      }),
    };
  }, [series, unit]);
  if (series.every((s) => s.points.length === 0)) return <p className="py-10 text-center text-[12px] text-muted">No observations.</p>;
  return <EChart option={option} height={height} ariaLabel={ariaLabel} />;
}
