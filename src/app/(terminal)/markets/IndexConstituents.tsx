"use client";

import { useState } from "react";
import { QuoteTable } from "@/components/QuoteTable";
import type { QuoteDTO } from "@/lib/dto";

export function IndexConstituents({ indices }: { indices: { id: number; name: string; rows: (QuoteDTO & { weight: number })[] }[] }) {
  const [sel, setSel] = useState(indices[0]?.id ?? 0);
  const current = indices.find((i) => i.id === sel);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <label htmlFor="idx-select" className="text-[11px] uppercase tracking-[0.05em] text-muted">
          Index
        </label>
        <select id="idx-select" value={sel} onChange={(e) => setSel(Number(e.target.value))} className="h-7 rounded border border-line-strong bg-bg px-2 text-[12px]">
          {indices.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-faint">{current?.rows.length ?? 0} constituents · weights from the demo methodology</span>
      </div>
      {current ? (
        <QuoteTable
          rows={current.rows}
          columns={["symbol", "name", "sector", "price", "changePct", "volume"]}
          extra={[{ key: "weight", header: "Weight", align: "right", render: (r) => `${(((r as QuoteDTO & { weight: number }).weight ?? 0) * 100).toFixed(2)}%` }]}
          pageSize={15}
          caption="Index constituents"
        />
      ) : null}
    </div>
  );
}
