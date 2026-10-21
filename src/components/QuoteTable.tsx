"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { DataTable, type Column } from "@/components/DataTable";
import { Change, StatusBadge } from "@/components/ui";
import { securityHref, type QuoteDTO } from "@/lib/dto";
import { fmtCompact, fmtPrice } from "@/lib/format";

type ColKey = "symbol" | "name" | "exchange" | "sector" | "price" | "change" | "changePct" | "volume" | "range" | "status";

export function QuoteTable({
  rows,
  columns = ["symbol", "name", "exchange", "price", "change", "changePct", "volume", "status"],
  pageSize = 25,
  searchable = true,
  extra,
  initialSort,
  empty,
  caption,
  maxHeight,
}: {
  rows: QuoteDTO[];
  columns?: ColKey[];
  pageSize?: number;
  searchable?: boolean;
  extra?: { header: string; render: (row: QuoteDTO) => ReactNode; key: string; align?: "left" | "right" }[];
  initialSort?: { key: string; dir: "asc" | "desc" };
  empty?: ReactNode;
  caption?: string;
  maxHeight?: number;
}) {
  const defs: Record<ColKey, Column<QuoteDTO>> = {
    symbol: {
      key: "symbol",
      header: "Symbol",
      sortValue: (r) => r.symbol,
      render: (r) => (
        <Link href={securityHref(r.exchange, r.symbol)} className="num font-semibold text-accent-strong hover:underline">
          {r.symbol}
        </Link>
      ),
    },
    name: { key: "name", header: "Name", sortValue: (r) => r.name, render: (r) => <span className="block max-w-[260px] truncate text-dim">{r.name}</span> },
    exchange: { key: "exchange", header: "Exch", sortValue: (r) => r.exchange, render: (r) => <span className="text-[11px] text-muted">{r.exchange}</span> },
    sector: { key: "sector", header: "Sector", sortValue: (r) => r.sector ?? "", render: (r) => <span className="text-muted">{r.sector ?? "—"}</span> },
    price: { key: "price", header: "Last", align: "right", sortValue: (r) => r.price, render: (r) => fmtPrice(r.price) },
    change: { key: "change", header: "Chg", align: "right", sortValue: (r) => r.change, render: (r) => <Change value={r.change} /> },
    changePct: { key: "changePct", header: "Chg %", align: "right", sortValue: (r) => r.changePct, render: (r) => <Change pct={r.changePct} /> },
    volume: { key: "volume", header: "Volume", align: "right", sortValue: (r) => r.volume, render: (r) => fmtCompact(r.volume) },
    range: {
      key: "range",
      header: "Day range",
      align: "right",
      render: (r) => (
        <span className="text-muted">
          {fmtPrice(r.low)} – {fmtPrice(r.high)}
        </span>
      ),
    },
    status: { key: "status", header: "Data", render: (r) => <StatusBadge status={r.status} asOf={r.asOf ?? undefined} /> },
  };
  const cols = [...columns.map((c) => defs[c]), ...(extra ?? []).map((e) => ({ key: e.key, header: e.header, render: e.render, align: e.align }))];
  return (
    <DataTable
      rows={rows}
      columns={cols}
      rowKey={(r) => r.id}
      searchText={searchable ? (r) => `${r.symbol} ${r.name} ${r.sector ?? ""} ${r.exchange}` : undefined}
      pageSize={pageSize}
      initialSort={initialSort}
      empty={empty}
      caption={caption}
      maxHeight={maxHeight}
      searchPlaceholder="Filter by symbol, name or sector…"
    />
  );
}
