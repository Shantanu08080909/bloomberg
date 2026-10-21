import type { Metadata } from "next";
import { MoversList } from "@/components/MoversList";
import { PageHeader, Panel } from "@/components/ui";
import { getActiveSourceId } from "@/lib/server/context";
import { db } from "@/lib/server/db";
import { getAllFundamentals, getIndices, listInstrumentsWithQuotes } from "@/lib/services/market";
import { SecurityPicker } from "./SecurityPicker";

export const metadata: Metadata = { title: "Security Details" };

export default async function SecurityIndexPage() {
  const database = await db();
  const sourceId = getActiveSourceId();
  const [indices, equities, fundamentals] = await Promise.all([
    getIndices(database, sourceId),
    listInstrumentsWithQuotes(database, sourceId, { types: ["EQUITY"], exchange: "NSE" }),
    getAllFundamentals(database, sourceId),
  ]);
  const cap = new Map(fundamentals.map((f) => [f.instrumentId, f.marketCapCr ?? 0]));
  const largest = [...equities].sort((a, b) => (cap.get(b.id) ?? 0) - (cap.get(a.id) ?? 0)).slice(0, 12);
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Security Details" subtitle="Choose a security to see its quote, chart, fundamentals, corporate actions, peers and news." />
      <Panel>
        <div className="max-w-xl">
          <SecurityPicker />
        </div>
      </Panel>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Indices" bodyClassName="p-0">
          <MoversList rows={indices} />
        </Panel>
        <Panel title="Largest NSE companies" bodyClassName="p-0">
          <MoversList rows={largest} />
        </Panel>
      </div>
    </div>
  );
}
