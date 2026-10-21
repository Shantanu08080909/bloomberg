import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/server/db";
import { getInstrumentById } from "@/lib/services/market";
import { listNotes } from "@/lib/services/user-data";
import { NotesClient } from "./NotesClient";

export const metadata: Metadata = { title: "Research Notes" };

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ id?: string; instrumentId?: string; new?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const database = await db();
  const rows = await listNotes(database, user.id);
  const iid = Number(sp.instrumentId);
  const inst = Number.isInteger(iid) && iid > 0 ? await getInstrumentById(database, iid) : null;
  const newFor = sp.new === "1" ? (inst ? { id: inst.id, symbol: inst.symbol, exchange: inst.exchange, name: inst.name } : "blank") : null;
  const notes = rows.map((r) => ({
    id: r.note.id,
    title: r.note.title,
    body: r.note.body,
    tags: r.note.tags,
    instrument: r.note.instrumentId && r.symbol ? { id: r.note.instrumentId, symbol: r.symbol, exchange: r.exchange ?? "", name: r.symbol } : null,
    updatedAt: r.note.updatedAt.toISOString(),
  }));
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Research Notes" subtitle="Plain-text notes, optionally linked to a security." />
      <NotesClient initial={notes} openId={Number(sp.id) || null} newFor={newFor as never} />
    </div>
  );
}
