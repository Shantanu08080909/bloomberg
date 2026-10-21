"use client";

import { useMemo } from "react";
import { EChart, axisStyle } from "@/components/charts/EChart";

export function YieldCurve({ tenors, curves }: { tenors: string[]; curves: { name: string; values: (number | null)[] }[] }) {
  const option = useMemo(
    () => ({
      grid: { left: 44, right: 16, top: 30, bottom: 28 },
      tooltip: { trigger: "axis", valueFormatter: (v: number | null) => (v == null ? "—" : `${v.toFixed(2)}%`) },
      legend: { top: 0, textStyle: { color: "#b3bac1" } },
      xAxis: { type: "category", data: tenors, ...axisStyle },
      yAxis: { type: "value", scale: true, name: "%", nameTextStyle: { color: "#7f8992" }, ...axisStyle },
      series: curves.map((c, i) => ({ name: c.name, type: "line", data: c.values, symbolSize: 6, lineStyle: { width: 2, type: i === 0 ? "solid" : "dashed" } })),
    }),
    [tenors, curves],
  );
  return <EChart option={option} height={260} ariaLabel="Government bond yield curve" />;
}
