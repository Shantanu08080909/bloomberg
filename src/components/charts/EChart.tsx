"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, HeatmapChart, LineChart, PieChart, TreemapChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  HeatmapChart,
  LineChart,
  PieChart,
  TreemapChart,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

export const ECHART_BASE = {
  backgroundColor: "transparent",
  textStyle: { color: "#b3bac1", fontFamily: "var(--font-geist-sans), system-ui, sans-serif", fontSize: 11 },
  color: ["#4fb6b0", "#6ea8fe", "#e2b13c", "#c48cf0", "#f08c5a", "#9bd46a", "#e0605a", "#7f8992"],
  tooltip: {
    backgroundColor: "#1b1f23",
    borderColor: "#3a424a",
    textStyle: { color: "#e4e7ea", fontSize: 11 },
    confine: true,
  },
};

export const axisStyle = {
  axisLine: { lineStyle: { color: "#2a3036" } },
  axisTick: { lineStyle: { color: "#2a3036" } },
  axisLabel: { color: "#7f8992", fontSize: 10.5 },
  splitLine: { lineStyle: { color: "#20252a" } },
};

export function EChart({
  option,
  height = 300,
  ariaLabel,
  onClick,
}: {
  option: Record<string, unknown>;
  height?: number;
  ariaLabel: string;
  onClick?: (params: { name?: string; data?: unknown }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    chart.on("click", (p) => clickRef.current?.(p as { name?: string; data?: unknown }));
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption({ ...ECHART_BASE, ...option }, true);
  }, [option]);

  return <div ref={ref} style={{ height }} className="w-full" role="img" aria-label={ariaLabel} />;
}
