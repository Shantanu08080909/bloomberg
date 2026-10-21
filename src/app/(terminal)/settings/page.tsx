import type { Metadata } from "next";
import { KeyValue, PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth/server";
import { describeConfig } from "@/lib/config";
import { getDbHandle } from "@/lib/db/client";
import { checkDatabaseHealth } from "@/lib/db/health";
import { db } from "@/lib/server/db";
import { getProfile } from "@/lib/services/user-data";
import { SettingsClient } from "./SettingsClient";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const database = await db();
  const handle = await getDbHandle();
  const [profile, health] = await Promise.all([getProfile(database, user.id), checkDatabaseHealth(handle.db, handle.mode)]);
  const cfg = describeConfig();
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Settings" subtitle="Your account and preferences. Server configuration is read from environment variables (.env.local)." />
      <SettingsClient
        username={user.username}
        smtpConfigured={cfg.smtpConfigured}
        profile={{
          displayName: profile?.displayName ?? user.displayName,
          notificationPrefs: profile?.notificationPrefs ?? { inApp: true, email: false },
          preferences: (profile?.preferences ?? {}) as { riskFreeRate?: number },
        }}
      />
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Server configuration (read-only, no secrets shown)">
          <KeyValue
            rows={[
              ["Database", cfg.database],
              ["Market data source", cfg.marketDataSource],
              ["Alpha Vantage key", cfg.alphaVantageConfigured ? "configured" : "not set"],
              ["FRED key", cfg.fredConfigured ? "configured" : "not set"],
              ["RSS feeds", String(cfg.rssFeedCount)],
              ["SMTP (email)", cfg.smtpConfigured ? "configured" : "not set"],
              ["Background scheduler", cfg.schedulerEnabled ? `enabled, every ${cfg.alertCheckIntervalSeconds}s` : "disabled"],
              ["Self-registration", cfg.registrationAllowed ? "allowed" : "closed"],
            ]}
          />
        </Panel>
        <Panel title="Database">
          <KeyValue
            rows={[
              ["Mode", health.mode],
              ["Status", health.ok ? "healthy" : health.message],
              ["Latency", health.latencyMs != null ? `${health.latencyMs} ms` : "—"],
              ["Instruments", health.instruments.toLocaleString("en-IN")],
              ["Price bars", health.priceBars.toLocaleString("en-IN")],
            ]}
          />
          <p className="mt-2 text-[11px] text-faint">Change these by editing .env.local and restarting the server. See README → Configuration.</p>
        </Panel>
      </div>
    </div>
  );
}
