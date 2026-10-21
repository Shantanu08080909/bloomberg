import type { Metadata } from "next";
import { Callout, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/server/db";
import { listEvents } from "@/lib/services/user-data";
import { CalendarClient } from "./CalendarClient";

export const metadata: Metadata = { title: "Economic Calendar" };

export default async function CalendarPage() {
  const user = await requireUser();
  const events = await listEvents(await db(), user.id);
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Economic Calendar" subtitle="Your tracked economic releases and events, in India Standard Time." />
      <Callout tone="warn" title="No live release calendar is connected">
        A current official schedule for RBI, MoSPI or other releases could not be obtained through a documented, permitted API, so this calendar does not invent
        upcoming dates. Sample events (labelled) sit inside the demo period for illustration only. Add the events you care about — with their source — using
        “Add event”.
      </Callout>
      <CalendarClient
        initial={events.map((e) => ({
          id: e.id,
          title: e.title,
          country: e.country,
          scheduledAt: e.scheduledAt.toISOString(),
          importance: e.importance,
          notes: e.notes,
          isSample: e.isSample,
          mine: e.userId === user.id,
        }))}
      />
    </div>
  );
}
