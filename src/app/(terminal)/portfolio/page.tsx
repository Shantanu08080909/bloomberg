import type { Metadata } from "next";
import { Callout, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/server";
import { getActiveSourceId } from "@/lib/server/context";
import { db } from "@/lib/server/db";
import { getIndices } from "@/lib/services/market";
import { listPortfolios } from "@/lib/services/user-data";
import { PortfolioClient } from "./PortfolioClient";

export const metadata: Metadata = { title: "Portfolio Manager" };

export default async function PortfolioPage() {
  const user = await requireUser();
  const database = await db();
  const [portfolios, indices] = await Promise.all([listPortfolios(database, user.id), getIndices(database, getActiveSourceId())]);
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Portfolio Manager" subtitle="Paper portfolios built from a transaction ledger. No brokerage connection; no real orders are placed." />
      <PortfolioClient initial={portfolios.map((p) => ({ id: p.id, name: p.name, benchmarkInstrumentId: p.benchmarkInstrumentId }))} benchmarks={indices.map((i) => ({ id: i.id, name: i.name }))} />
      <Callout tone="info" title="Accounting method">
        Weighted-average cost per security. Buys add quantity and cost (including fees); sells remove shares at the current average cost, and realised
        P&amp;L = proceeds − fees − average cost × quantity. Dividends are recorded as cash income and do not change cost. Splits and bonuses multiply
        quantity and leave total cost unchanged. Taxes are only included if you add them to fees. Indian capital-gains reporting uses FIFO and holding-period
        rules that are <strong>not</strong> implemented here — do not use this ledger for tax filing. Symbol changes and mergers must be recorded manually.
      </Callout>
    </div>
  );
}
