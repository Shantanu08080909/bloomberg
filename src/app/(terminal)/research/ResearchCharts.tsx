"use client";

import { useMemo } from "react";
import { EChart, axisStyle } from "@/components/charts/EChart";

export function ResearchCharts({ years, revenue, profit, margin, roe }: { years: string[]; revenue: (number | null)[]; profit: (number | null)[]; margin: (number | null)[]; roe: (number | null)[] }) {
  const growth = useMemo(
    () => ({
      grid: { left: 64, right: 48, top: 30, bottom: 24 },
      tooltip: { trigger: "axis" },
      legend: { top: 0, textStyle: { color: "#b3bac1" } },
      xAxis: { type: "category", data: years, ...axisStyle },
      yAxis: [
        { type: "value", name: "₹ crore", nameTextStyle: { color: "#7f8992" }, ...axisStyle },
        { type: "value", name: "%", nameTextStyle: { color: "#7f8992" }, ...axisStyle, splitLine: { show: false } },
      ],
      series: [
        { name: "Revenue", type: "bar", data: revenue, itemStyle: { color: "#4fb6b0" }, barMaxWidth: 28 },
        { name: "Net profit", type: "bar", data: profit, itemStyle: { color: "#6ea8fe" }, barMaxWidth: 28 },
        { name: "Net margin %", type: "line", yAxisIndex: 1, data: margin, itemStyle: { color: "#e2b13c" } },
        { name: "ROE %", type: "line", yAxisIndex: 1, data: roe, itemStyle: { color: "#c48cf0" } },
      ],
    }),
    [years, revenue, profit, margin, roe],
  );
  return <EChart option={growth} height={280} ariaLabel="Revenue, profit, margin and return on equity by fiscal year" />;
}
