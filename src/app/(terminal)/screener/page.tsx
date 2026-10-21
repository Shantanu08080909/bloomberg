import type { Metadata } from "next";
import { PageHeader, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth/server";
import { getActiveSourceId, getShellStatus } from "@/lib/server/context";
import { db } from "@/lib/server/db";
import { getSectors } from "@/lib/services/market";
import { listScreeners } from "@/lib/services/user-data";
import { ScreenerClient } from "./ScreenerClient";

export const metadata: Metadata = { title: "Stock Screener" };

export default async function ScreenerPage() {
  const user = await requireUser();
  const database = await db();
  const [status, sectors, saved] = await Promise.all([getShellStatus(), getSectors(database, getActiveSourceId()), listScreeners(database, user.id)]);
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Stock Screener" subtitle="Combine price, fundamental and technical filters. Filtering runs on the server." status={<StatusBadge status={status.tone} />} />
      <ScreenerClient sectors={sectors} initialSaved={saved.map((s) => ({ id: s.id, name: s.name, config: s.config }))} />
    </div>
  );
}
