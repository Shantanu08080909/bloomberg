import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/** Persistent, unmistakable banner shown on every screen while demo data is active. */
export function DemoBanner({ asOf }: { asOf: string | null }) {
  return (
    <div role="status" aria-live="polite" className="demo-stripe border-b border-demo/50 bg-demo-soft">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1 text-[11.5px] text-demo">
        <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
        <strong className="font-bold tracking-[0.06em]">DEMO DATA — NOT REAL MARKET PRICES</strong>
        <span className="text-dim">
          Fictional companies and synthetic prices generated on this computer{asOf ? `, as of ${asOf}` : ""}. Indices are demo series, not official NSE/BSE values.
        </span>
        <Link href="/help#demo-data" className="ml-auto text-demo underline underline-offset-2 hover:text-fg">
          What is demo mode?
        </Link>
      </div>
    </div>
  );
}
