import type { Metadata } from "next";
import { PageHeader, Panel, StatusBadge } from "@/components/ui";
import { toQuoteDTO } from "@/lib/dto";
import { getActiveSourceId, getShellStatus } from "@/lib/server/context";
import { db } from "@/lib/server/db";
import { getAllFundamentals, getSectors, listInstrumentsWithQuotes } from "@/lib/services/market";
import { ExplorerClient } from "./ExplorerClient";

export const metadata: Metadata = { title: "Stock Explorer" };

export default async function ExplorerPage() {
  const database = await db();
  const sourceId = getActiveSourceId();
  const [status, all, fundamentals, sectors] = await Promise.all([
    getShellStatus(),
    listInstrumentsWithQuotes(database, sourceId),
    getAllFundamentals(database, sourceId),
    getSectors(database, sourceId),
  ]);
  const f = new Map(fundamentals.map((x) => [x.instrumentId, x]));
  const rows = all.map((i) => ({ ...toQuoteDTO(i), marketCapCr: f.get(i.id)?.marketCapCr ?? null, pe: f.get(i.id)?.pe ?? null }));
  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Stock Explorer"
        subtitle={`${rows.length} instruments from ${status.sourceName}. Click a symbol for charts, fundamentals and news.`}
        status={<StatusBadge status={status.tone} />}
      />
      <Panel bodyClassName="p-0">
        <ExplorerClient rows={rows} sectors={sectors} />
      </Panel>
    </div>
  );
}
