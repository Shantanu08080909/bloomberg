import type { Metadata } from "next";
import { PageHeader, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth/server";
import { getActiveSourceId, getShellStatus } from "@/lib/server/context";
import { db } from "@/lib/server/db";
import { getIndices } from "@/lib/services/market";
import { listPortfolios } from "@/lib/services/user-data";
import { RiskClient } from "./RiskClient";

export const metadata: Metadata = { title: "Risk Analytics" };

export default async function RiskPage() {
  const user = await requireUser();
  const database = await db();
  const [status, portfolios, indices] = await Promise.all([getShellStatus(), listPortfolios(database, user.id), getIndices(database, getActiveSourceId())]);
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Risk Analytics" subtitle="Volatility, drawdown, beta, Sharpe, correlation, concentration and historical stress windows." status={<StatusBadge status={status.tone} />} />
      <RiskClient portfolios={portfolios.map((p) => ({ id: p.id, name: p.name }))} benchmarks={indices.map((i) => ({ id: i.id, name: i.name }))} />
    </div>
  );
}
