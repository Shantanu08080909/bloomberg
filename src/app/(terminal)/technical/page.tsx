import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { getActiveSourceId } from "@/lib/server/context";
import { db } from "@/lib/server/db";
import { getInstrument, getInstrumentById } from "@/lib/services/market";
import { TechnicalClient } from "./TechnicalClient";

export const metadata: Metadata = { title: "Technical Analysis" };

export default async function TechnicalPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const database = await db();
  const n = Number(id);
  const inst = Number.isInteger(n) && n > 0 ? await getInstrumentById(database, n) : await getInstrument(database, getActiveSourceId(), "INDEX", "NIFTY50");
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Technical Analysis" subtitle="Configurable indicators on daily price history. Charts and calculations are separate: indicator logic is unit-tested." />
      <TechnicalClient initial={inst ? { id: inst.id, symbol: inst.symbol, exchange: inst.exchange, name: inst.name } : null} />
    </div>
  );
}
