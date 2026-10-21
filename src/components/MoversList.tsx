import Link from "next/link";
import { Change } from "@/components/ui";
import { securityHref } from "@/lib/dto";
import { fmtCompact, fmtPrice } from "@/lib/format";
import type { InstrumentWithQuote } from "@/lib/services/market";

export function MoversList({ rows, metric = "change" }: { rows: InstrumentWithQuote[]; metric?: "change" | "turnover" }) {
  if (rows.length === 0) return <p className="px-3 py-6 text-center text-[12px] text-muted">No securities in this list.</p>;
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th scope="col">Symbol</th>
          <th scope="col" className="r">Last</th>
          <th scope="col" className="r">{metric === "turnover" ? "Turnover" : "Chg %"}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <Link href={securityHref(r.exchange, r.symbol)} className="num font-semibold text-accent-strong hover:underline">
                {r.symbol}
              </Link>
              <div className="max-w-[150px] truncate text-[10.5px] text-faint">{r.name}</div>
            </td>
            <td className="r num">{fmtPrice(r.quote?.price)}</td>
            <td className="r num">
              {metric === "turnover" ? (
                <span className="text-dim">₹{fmtCompact((r.quote?.price ?? 0) * (r.quote?.volume ?? 0))}</span>
              ) : (
                <Change pct={r.quote?.changePct} />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
