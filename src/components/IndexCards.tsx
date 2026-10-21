import Link from "next/link";
import { Sparkline } from "@/components/Sparkline";
import { Change, StatusBadge } from "@/components/ui";
import { securityHref } from "@/lib/dto";
import { fmtPrice } from "@/lib/format";
import type { InstrumentWithQuote } from "@/lib/services/market";

export function IndexCards({ indices, sparks }: { indices: InstrumentWithQuote[]; sparks: Map<number, { close: number }[]> }) {
  if (indices.length === 0) {
    return <p className="rounded-panel border border-line bg-panel px-3 py-4 text-[12px] text-muted">Index data unavailable from the active source.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {indices.map((i) => (
        <Link
          key={i.id}
          href={securityHref(i.exchange, i.symbol)}
          className="group rounded-panel border border-line bg-panel px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-panel-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[11px] font-semibold text-dim group-hover:text-fg">{i.name.replace(" (demo series)", "")}</div>
              <div className="num mt-1 text-[16px] font-medium text-fg">{fmtPrice(i.quote?.price)}</div>
            </div>
            <StatusBadge status={i.displayStatus} />
          </div>
          <div className="mt-1 flex items-end justify-between gap-2">
            <Change value={i.quote?.change} pct={i.quote?.changePct} className="text-[11.5px]" />
            <Sparkline values={(sparks.get(i.id) ?? []).map((b) => b.close)} width={70} height={22} />
          </div>
        </Link>
      ))}
    </div>
  );
}
