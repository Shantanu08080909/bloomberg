import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/server/db";
import { listWatchlists } from "@/lib/services/user-data";
import { WatchlistsClient } from "./WatchlistsClient";

export const metadata: Metadata = { title: "Watchlists" };

export default async function WatchlistsPage() {
  const user = await requireUser();
  const lists = await listWatchlists(await db(), user.id);
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Watchlists" subtitle="Named lists of securities, saved in your local database." />
      <Suspense>
        <WatchlistsClient initial={lists.map((l) => ({ id: l.id, name: l.name, itemCount: l.itemCount }))} />
      </Suspense>
    </div>
  );
}
