import { and, eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { classifyFreshness, STATUS_LABEL, type FreshnessThresholds } from "@/lib/market/freshness";

export type AlertKind = "PRICE_ABOVE" | "PRICE_BELOW" | "PCT_UP" | "PCT_DOWN";

export function alertConditionMet(kind: AlertKind, threshold: number, price: number, changePct: number | null): boolean {
  switch (kind) {
    case "PRICE_ABOVE":
      return price >= threshold;
    case "PRICE_BELOW":
      return price <= threshold;
    case "PCT_UP":
      return changePct != null && changePct >= threshold;
    case "PCT_DOWN":
      return changePct != null && changePct <= -threshold;
  }
}

export function describeAlert(kind: AlertKind, threshold: number) {
  switch (kind) {
    case "PRICE_ABOVE":
      return `price at or above ₹${threshold}`;
    case "PRICE_BELOW":
      return `price at or below ₹${threshold}`;
    case "PCT_UP":
      return `daily change at or above +${threshold}%`;
    case "PCT_DOWN":
      return `daily change at or below −${threshold}%`;
  }
}

export interface AlertCheckResult {
  checked: number;
  triggered: number;
  skippedStale: number;
  noQuote: number;
}

type EmailSender = (to: string, subject: string, body: string) => Promise<boolean>;

/**
 * Evaluate active alerts against the latest stored quote of each alert's
 * instrument (from that instrument's own source). An alert fires at most once
 * per quote timestamp. Stale or missing quotes never trigger an alert.
 */
export async function checkAlerts(
  db: Database,
  opts: { userId?: string; now?: Date; thresholds?: FreshnessThresholds; sendEmail?: EmailSender } = {},
): Promise<AlertCheckResult> {
  const now = opts.now ?? new Date();
  const conds = [eq(s.alerts.active, true)];
  if (opts.userId) conds.push(eq(s.alerts.userId, opts.userId));
  const rows = await db
    .select({ alert: s.alerts, inst: s.instruments, quote: s.quotes, profile: s.profiles })
    .from(s.alerts)
    .innerJoin(s.instruments, eq(s.instruments.id, s.alerts.instrumentId))
    .leftJoin(s.quotes, and(eq(s.quotes.instrumentId, s.instruments.id), eq(s.quotes.sourceId, s.instruments.sourceId)))
    .leftJoin(s.profiles, eq(s.profiles.userId, s.alerts.userId))
    .where(and(...conds));

  const result: AlertCheckResult = { checked: 0, triggered: 0, skippedStale: 0, noQuote: 0 };
  for (const { alert, inst, quote, profile } of rows) {
    result.checked++;
    if (!quote) {
      result.noQuote++;
      await db.update(s.alerts).set({ lastCheckedAt: now }).where(eq(s.alerts.id, alert.id));
      continue;
    }
    const status = classifyFreshness(quote.dataStatus, quote.asOf, now, opts.thresholds);
    if (status === "stale" || status === "unavailable") {
      result.skippedStale++;
      await db.update(s.alerts).set({ lastCheckedAt: now }).where(eq(s.alerts.id, alert.id));
      continue;
    }
    const alreadyFiredForQuote = alert.lastTriggeredAt != null && alert.lastTriggeredAt.getTime() >= quote.asOf.getTime();
    const met = alertConditionMet(alert.kind as AlertKind, alert.threshold, quote.price, quote.changePct);
    if (!met || alreadyFiredForQuote) {
      await db.update(s.alerts).set({ lastCheckedAt: now }).where(eq(s.alerts.id, alert.id));
      continue;
    }
    result.triggered++;
    const tag = STATUS_LABEL[status];
    const title = `[${tag}] ${inst.symbol} (${inst.exchange}): ${describeAlert(alert.kind as AlertKind, alert.threshold)}`;
    const body = `${inst.name} — last price ₹${quote.price.toFixed(2)} (${quote.changePct != null ? quote.changePct.toFixed(2) : "—"}%) as of ${quote.asOf.toISOString()}. Source: ${inst.sourceId}.${status === "demo" ? " This is a DEMO alert based on synthetic data, not a real market price." : ""}`;
    await db.transaction(async (tx) => {
      await tx
        .update(s.alerts)
        // lastTriggeredAt stores the data timestamp that fired, so a repeating alert
        // fires again only when a newer quote arrives.
        .set({ lastCheckedAt: now, lastTriggeredAt: quote.asOf, active: alert.repeat })
        .where(eq(s.alerts.id, alert.id));
      const prefs = profile?.notificationPrefs ?? { inApp: true, email: false };
      if (prefs.inApp !== false) {
        await tx.insert(s.notificationHistory).values({
          userId: alert.userId,
          alertId: alert.id,
          channel: "in_app",
          title,
          body,
          dataStatus: status,
          dataAsOf: quote.asOf,
        });
      }
    });
    const prefs = profile?.notificationPrefs;
    if (prefs?.email && prefs.emailAddress && opts.sendEmail) {
      let delivery = "sent";
      try {
        const ok = await opts.sendEmail(prefs.emailAddress, title, body);
        if (!ok) delivery = "not_configured";
      } catch (err) {
        delivery = `failed: ${err instanceof Error ? err.message.slice(0, 120) : "error"}`;
      }
      await db.insert(s.notificationHistory).values({
        userId: alert.userId,
        alertId: alert.id,
        channel: "email",
        title,
        body,
        dataStatus: status,
        dataAsOf: quote.asOf,
        deliveryStatus: delivery,
        readAt: now,
      });
    }
  }
  return result;
}
