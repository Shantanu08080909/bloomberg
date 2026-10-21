"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { QuoteTable } from "@/components/QuoteTable";
import { buttonClass } from "@/components/ui";
import { downloadFile } from "@/lib/client/api";
import type { QuoteDTO } from "@/lib/dto";
import { fmtCrore, fmtMultiple } from "@/lib/format";

type Row = QuoteDTO & { marketCapCr: number | null; pe: number | null };

const selectClass = "h-7 rounded border border-line-strong bg-bg px-2 text-[12px]";

export function ExplorerClient({ rows, sectors }: { rows: Row[]; sectors: string[] }) {
  const [exchange, setExchange] = useState("ALL");
  const [type, setType] = useState("EQUITY");
  const [sector, setSector] = useState("ALL");
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(
    () => rows.filter((r) => (exchange === "ALL" || r.exchange === exchange) && (type === "ALL" || r.type === type) && (sector === "ALL" || r.sector === sector)),
    [rows, exchange, type, sector],
  );

  const exportCsv = () => {
    setError(null);
    const config = {
      exchanges: exchange === "ALL" ? [] : [exchange],
      sectors: sector === "ALL" ? [] : [sector],
      types: type === "ALL" || type === "INDEX" ? [] : [type],
    };
    downloadFile(`/api/screener/export?config=${encodeURIComponent(JSON.stringify(config))}`, "securities.csv").catch((e: Error) => setError(e.message));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          Exchange
          <select className={selectClass} value={exchange} onChange={(e) => setExchange(e.target.value)}>
            <option value="ALL">All</option>
            <option value="NSE">NSE</option>
            <option value="BSE">BSE</option>
            <option value="INDEX">Indices</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          Type
          <select className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="ALL">All</option>
            <option value="EQUITY">Equity</option>
            <option value="ETF">ETF</option>
            <option value="INDEX">Index</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          Sector
          <select className={selectClass} value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="ALL">All sectors</option>
            {sectors.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={exportCsv} className={buttonClass("default", "sm") + " ml-auto"}>
          <Download className="size-3.5" aria-hidden /> Export CSV
        </button>
        {error ? <span className="w-full text-[11px] text-down">{error}</span> : null}
      </div>
      <QuoteTable
        rows={filtered}
        columns={["symbol", "name", "exchange", "sector", "price", "change", "changePct", "range", "volume", "status"]}
        extra={[
          { key: "mcap", header: "Mkt cap", align: "right", render: (r) => fmtCrore((r as Row).marketCapCr) },
          { key: "pe", header: "P/E", align: "right", render: (r) => fmtMultiple((r as Row).pe) },
        ]}
        pageSize={30}
        initialSort={{ key: "symbol", dir: "asc" }}
        caption="All securities"
      />
    </div>
  );
}
