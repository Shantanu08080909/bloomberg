import type { Metadata } from "next";
import Link from "next/link";
import { Callout, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/server";
import { describeConfig } from "@/lib/config";
import { formatIST } from "@/lib/dates";
import { db } from "@/lib/server/db";
import { getSchedulerStatus } from "@/lib/server/scheduler";
import { getInstrumentById } from "@/lib/services/market";
import { getProfile, listAlerts, listNotifications } from "@/lib/services/user-data";
import { AlertsClient } from "./AlertsClient";

export const metadata: Metadata = { title: "Alerts" };

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ instrumentId?: string }> }) {
  const user = await requireUser();
  const { instrumentId } = await searchParams;
  const database = await db();
  const [alerts, notifications, scheduler, profile] = await Promise.all([listAlerts(database, user.id), listNotifications(database, user.id, 100), getSchedulerStatus(), getProfile(database, user.id)]);
  const n = Number(instrumentId);
  const preset = Number.isInteger(n) && n > 0 ? await getInstrumentById(database, n) : null;
  const cfg = describeConfig();
  const prefs = profile?.notificationPrefs;

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Alerts" subtitle="Price and percentage-change alerts evaluated against each instrument's own source and data timestamp." />
      {scheduler.running ? (
        <Callout tone="info" title="Background checks are running">
          The in-process scheduler last ran at {formatIST(scheduler.lastTick)} IST and checks every {scheduler.intervalSeconds}s while the server is running. It
          stops when the server stops. Demo prices are static, so demo alerts fire at most once per demo quote.
        </Callout>
      ) : (
        <Callout tone="warn" title="Alerts are not being monitored in the background">
          {scheduler.enabled
            ? "The scheduler is enabled but has not reported a recent heartbeat (it may still be starting). "
            : "SCHEDULER_ENABLED=false, so no background checks run. "}
          Use “Check now” to evaluate alerts on demand.
        </Callout>
      )}
      <p className="text-[11.5px] text-muted">
        Delivery: in-app {prefs?.inApp === false ? "off" : "on"} · email{" "}
        {prefs?.email ? (cfg.smtpConfigured ? `on (${prefs.emailAddress ?? "no address set"})` : "requested, but SMTP is not configured") : "off"} —{" "}
        <Link href="/settings" className="text-accent hover:underline">
          change in Settings
        </Link>
        . Alerts never fire on stale or missing quotes.
      </p>
      <AlertsClient
        preset={preset ? { id: preset.id, symbol: preset.symbol, exchange: preset.exchange, name: preset.name } : null}
        alerts={alerts.map((r) => ({
          ...r.alert,
          kind: r.alert.kind as "PRICE_ABOVE",
          symbol: r.symbol,
          exchange: r.exchange,
          name: r.name,
          sourceId: r.sourceId,
          lastCheckedAt: r.alert.lastCheckedAt?.toISOString() ?? null,
          lastTriggeredAt: r.alert.lastTriggeredAt?.toISOString() ?? null,
          createdAt: r.alert.createdAt.toISOString(),
        }))}
        notifications={notifications.map((x) => ({
          id: x.id,
          channel: x.channel,
          title: x.title,
          body: x.body,
          dataStatus: x.dataStatus,
          deliveryStatus: x.deliveryStatus,
          createdAt: x.createdAt.toISOString(),
          readAt: x.readAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
