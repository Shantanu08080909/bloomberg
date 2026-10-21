import { redirect } from "next/navigation";
import { countUsers } from "@/lib/auth/core";
import { getCurrentUser } from "@/lib/auth/server";
import { DatabaseError } from "@/components/DatabaseError";
import { DemoBanner } from "@/components/DemoBanner";
import { Shell } from "@/components/shell/Shell";
import { db, DatabaseUnavailableError } from "@/lib/server/db";
import { getShellStatus } from "@/lib/server/context";
import { listWatchlists, unreadNotificationCount } from "@/lib/services/user-data";

export const dynamic = "force-dynamic";

export default async function TerminalLayout({ children }: { children: React.ReactNode }) {
  let database;
  try {
    database = await db();
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) return <DatabaseError message={err.message} />;
    throw err;
  }
  const user = await getCurrentUser();
  if (!user) redirect((await countUsers(database)) === 0 ? "/setup" : "/login");

  const [status, unread, lists] = await Promise.all([
    getShellStatus(),
    unreadNotificationCount(database, user.id),
    listWatchlists(database, user.id),
  ]);

  return (
    <Shell
      user={{ displayName: user.displayName }}
      status={{ sourceName: status.sourceName, label: status.label, tone: status.tone, lastAsOf: status.lastAsOf, mixed: status.mixed }}
      unread={unread}
      watchlists={lists.map((l) => ({ id: l.id, name: l.name }))}
      banner={status.tone === "demo" ? <DemoBanner asOf={status.lastAsOf} /> : null}
    >
      {children}
    </Shell>
  );
}
