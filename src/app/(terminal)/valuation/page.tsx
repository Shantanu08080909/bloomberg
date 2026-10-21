import type { Metadata } from "next";
import { Callout, PageHeader, StatusBadge } from "@/components/ui";
import { getActiveSourceId } from "@/lib/server/context";
import { db } from "@/lib/server/db";
import { getCorporateActions, getFundamentals, getInstrumentById, getPeers, getStatements } from "@/lib/services/market";
import { ResearchPicker } from "../research/ResearchPicker";
import { ValuationClient, type ValuationContext } from "./ValuationClient";

export const metadata: Metadata = { title: "Valuation Lab" };

export default async function ValuationPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const database = await db();
  const n = Number(id);
  const inst = Number.isInteger(n) && n > 0 ? await getInstrumentById(database, n) : null;
  let ctx: ValuationContext | null = null;
  if (inst && inst.instrumentType !== "INDEX" && inst.sourceId === getActiveSourceId()) {
    const [f, statements, peers, divs] = await Promise.all([
      getFundamentals(database, inst.id, inst.sourceId),
      getStatements(database, inst.id, inst.sourceId),
      getPeers(database, inst, 8),
      getCorporateActions(database, inst.sourceId, { instrumentId: inst.id, type: "DIVIDEND", limit: 1 }),
    ]);
    const latestYear = Math.max(0, ...statements.map((s) => s.fiscalYear));
    const latest = (type: string) => statements.find((s) => s.statementType === type && s.fiscalYear === latestYear)?.lineItems;
    const cash = latest("cashflow");
    const bal = latest("balance");
    const debt = bal?.totalDebt ?? null;
    const cashEq = bal?.cashAndEquivalents ?? null;
    ctx = {
      symbol: inst.symbol,
      name: inst.name,
      status: inst.displayStatus,
      price: inst.quote?.price ?? null,
      eps: f?.eps ?? null,
      bvps: f?.bookValuePerShare ?? null,
      sharesCr: f?.sharesOutstanding != null ? f.sharesOutstanding / 1e7 : null,
      marketCapCr: f?.marketCapCr ?? null,
      fcfCr: cash?.freeCashFlow ?? null,
      netDebtCr: debt != null && cashEq != null ? debt - cashEq : null,
      debtCr: debt,
      dividendPerShare: (divs[0]?.action.details.amountPerShare as number | undefined) ?? null,
      peers: peers.map((p) => ({ name: p.instrument.symbol, pe: p.f?.pe ?? null, pb: p.f?.pb ?? null })),
    };
  }
  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Valuation Lab"
        subtitle="Transparent calculators. Inputs marked “sourced” come from the active dataset; everything else is your assumption."
        status={ctx ? <StatusBadge status={ctx.status as "demo"} /> : undefined}
      />
      <div className="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-panel px-3 py-2">
        <span className="text-[11px] uppercase tracking-[0.05em] text-muted">Company (optional)</span>
        <div className="w-full sm:w-96">
          <ValuationPicker current={inst && ctx ? { id: inst.id, symbol: inst.symbol, exchange: inst.exchange, name: inst.name } : null} />
        </div>
        {ctx?.status === "demo" ? <span className="text-[11px] text-demo">Sourced values are synthetic demo data.</span> : null}
      </div>
      <ValuationClient key={inst?.id ?? "none"} ctx={ctx} />
      <Callout tone="info">
        These tools compute the arithmetic consequences of the assumptions you enter. They do not forecast prices or returns, are not investment advice,
        and small changes in discount and growth rates can change results substantially — check the sensitivity table.
      </Callout>
    </div>
  );
}

function ValuationPicker({ current }: { current: { id: number; symbol: string; exchange: string; name: string } | null }) {
  return <ResearchPicker current={current} basePath="/valuation" />;
}
