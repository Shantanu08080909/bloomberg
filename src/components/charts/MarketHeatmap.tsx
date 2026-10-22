"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { EChart } from "./EChart";

export interface HeatCell {
  symbol: string;
  exchange: string;
  name: string;
  sector: string;
  marketCapCr: number;
  changePct: number | null;
}

function colorFor(pct: number | null) {
  if (pct == null) return "#2a3036";
  const c = Math.max(-4, Math.min(4, pct)) / 4;
  if (c >= 0) return `rgba(63,177,125,${0.22 + 0.7 * c})`;
  return `rgba(224,96,90,${0.22 + 0.7 * -c})`;
}

/** Sector treemap: tile area = market cap, colour = daily change. */
export function MarketHeatmap({ cells, height = 420, sizeLabel = "Mkt cap" }: { cells: HeatCell[]; height?: number; sizeLabel?: string }) {
  const router = useRouter();
  const option = useMemo(() => {
    const bySector = new Map<string, HeatCell[]>();
    for (const c of cells) bySector.set(c.sector, [...(bySector.get(c.sector) ?? []), c]);
    return {
      tooltip: {
        formatter: (p: { data?: { name: string; fullName?: string; value: number; pct?: number | null } }) => {
          const d = p.data;
          if (!d) return "";
          const pct = d.pct == null ? "—" : `${d.pct > 0 ? "+" : ""}${d.pct.toFixed(2)}%`;
          return `<b>${d.name}</b>${d.fullName ? `<br/>${d.fullName}` : ""}<br/>${sizeLabel} ₹${Math.round(d.value).toLocaleString("en-IN")} cr<br/>Change ${pct}`;
        },
      },
      series: [
        {
          type: "treemap",
          name: "Market",
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          width: "100%",
          height: "100%",
          top: 0,
          left: 0,
          upperLabel: { show: true, height: 18, color: "#b3bac1", fontSize: 10.5, fontWeight: 600 },
          label: { show: true, formatter: (p: { data: { name: string; pct?: number | null } }) => `${p.data.name}\n${p.data.pct == null ? "" : `${p.data.pct > 0 ? "+" : ""}${p.data.pct.toFixed(2)}%`}`, color: "#e4e7ea", fontSize: 10.5, lineHeight: 13 },
          itemStyle: { borderColor: "#0e1012", borderWidth: 1, gapWidth: 1 },
          levels: [
            { itemStyle: { borderWidth: 0, gapWidth: 3 }, upperLabel: { show: false } },
            { itemStyle: { borderColor: "#0e1012", borderWidth: 2, gapWidth: 1 }, color: ["#1b1f23"] },
            { itemStyle: { gapWidth: 1 } },
          ],
          data: [...bySector.entries()].map(([sector, list]) => ({
            name: sector,
            value: list.reduce((s, c) => s + c.marketCapCr, 0),
            children: list.map((c) => ({
              name: c.symbol,
              fullName: c.name,
              exchange: c.exchange,
              value: c.marketCapCr,
              pct: c.changePct,
              itemStyle: { color: colorFor(c.changePct) },
            })),
          })),
        },
      ],
    };
  }, [cells, sizeLabel]);
  if (cells.length === 0) return <p className="py-8 text-center text-[12px] text-muted">Heatmap unavailable: market capitalisation data is missing for this source.</p>;
  return (
    <EChart
      option={option}
      height={height}
      ariaLabel="Sector heatmap of securities sized by market cap and coloured by daily change"
      onClick={(p) => {
        const d = p.data as { name?: string; exchange?: string } | undefined;
        if (d?.exchange && d.name) router.push(`/security/${d.exchange}/${d.name}`);
      }}
    />
  );
}
