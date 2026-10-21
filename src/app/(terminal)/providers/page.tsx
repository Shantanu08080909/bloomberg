import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Callout, KeyValue, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { describeConfig } from "@/lib/config";
import { formatIST } from "@/lib/dates";
import { thresholdsFromEnv } from "@/lib/market/freshness";
import { SOURCE_CATALOG } from "@/lib/providers/catalog";
import { getProviders } from "@/lib/providers/registry";
import { getActiveSourceId, getShellStatus } from "@/lib/server/context";
import { db } from "@/lib/server/db";
import { EXPORT_POLICY } from "@/lib/server/export-policy";
import { getSchedulerStatus } from "@/lib/server/scheduler";
import { listDataSources, listRefreshRuns, syncSourceConfiguration } from "@/lib/services/refresh";
import { RefreshSourceButton } from "./RefreshSourceButton";

export const metadata: Metadata = { title: "Data Provider Status" };

export default async function ProvidersPage() {
  const database = await db();
  await syncSourceConfiguration(database);
  const providers = getProviders();
  const [sources, runs, scheduler, status] = await Promise.all([listDataSources(database), listRefreshRuns(database, 30), getSchedulerStatus(), getShellStatus()]);
  const cfg = describeConfig();
  const active = getActiveSourceId();
  const th = thresholdsFromEnv();
  const configured: Record<string, boolean> = {
    demo: true,
    user: true,
    alphavantage: providers.market.alphavantage.isConfigured(),
    fred: providers.economic.fred.isConfigured(),
    rss: providers.news.rss.isConfigured(),
  };
  const requirement: Record<string, string> = {
    alphavantage: "Set ALPHAVANTAGE_API_KEY and ALPHAVANTAGE_SYMBOLS; set MARKET_DATA_SOURCE=alphavantage to display it.",
    fred: "Set FRED_API_KEY (and optionally FRED_SERIES).",
    rss: "Set NEWS_RSS_FEEDS to a comma-separated list of feed URLs you may use.",
    demo: "Always available.",
    user: "Created by Data Explorer → Import CSV.",
  };

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Data Provider Status" subtitle="Which sources are configured, when they last succeeded or failed, and what each one is allowed to do." status={<StatusBadge status={status.tone} />} />
      {cfg.marketDataSource === "alphavantage" && active === "demo" ? (
        <Callout tone="warn">MARKET_DATA_SOURCE=alphavantage is set, but ALPHAVANTAGE_API_KEY is missing, so the terminal is still showing demo data.</Callout>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel title="Active market data">
          <KeyValue
            rows={[
              ["Source", status.sourceName],
              ["Display status", <StatusBadge key="s" status={status.tone} />],
              ["Quotes stored", status.quoteCount.toLocaleString("en-IN")],
              ["Latest data point", status.lastAsOf ? `${status.lastAsOf} IST` : "—"],
              ["Mixed statuses", status.mixed ? "yes" : "no"],
            ]}
          />
        </Panel>
        <Panel title="Background scheduler">
          <KeyValue
            rows={[
              ["Enabled", scheduler.enabled ? "yes" : "no (SCHEDULER_ENABLED=false)"],
              ["Running", scheduler.running ? <Badge key="r" tone="up">heartbeat OK</Badge> : <Badge key="r" tone="stale">no recent heartbeat</Badge>],
              ["Last run", scheduler.lastTick ? `${formatIST(scheduler.lastTick)} IST` : "never"],
              ["Interval", `${scheduler.intervalSeconds}s`],
            ]}
          />
          <p className="mt-2 text-[11px] text-faint">The scheduler runs inside the web server process and stops when it stops. It checks alerts and refreshes configured real sources on their interval.</p>
        </Panel>
        <Panel title="Freshness thresholds">
          <KeyValue
            rows={[
              ["LIVE → STALE after", `${th.liveMinutes} min (STALE_AFTER_MINUTES_LIVE)`],
              ["DELAYED → STALE after", `${th.delayedMinutes} min (STALE_AFTER_MINUTES_DELAYED)`],
              ["END OF DAY → STALE after", `${th.eodHours} h (STALE_AFTER_HOURS_EOD)`],
              ["DEMO", "never becomes live or stale"],
            ]}
          />
        </Panel>
      </div>

      <Panel title="Configured sources" bodyClassName="p-0 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Kind</th>
              <th>Configured</th>
              <th>Labels data as</th>
              <th>Last success</th>
              <th>Last error</th>
              <th>Refresh interval</th>
              <th>Export</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="font-medium text-fg">{s.name}</div>
                  <div className="max-w-[260px] whitespace-normal text-[11px] text-faint">{s.termsNote}</div>
                </td>
                <td className="text-muted">{s.kind}</td>
                <td>{configured[s.id] ? <Badge tone="up">yes</Badge> : <Badge title={requirement[s.id]}>no</Badge>}</td>
                <td>
                  <StatusBadge status={s.defaultStatus as "demo"} />
                </td>
                <td className="num text-[11.5px] text-muted">{s.lastSuccessAt ? formatIST(s.lastSuccessAt) : "—"}</td>
                <td className="max-w-[260px] whitespace-normal text-[11.5px]">
                  {s.lastError ? (
                    <span className="text-down">
                      {s.lastError} <span className="text-faint">({formatIST(s.lastErrorAt)})</span>
                    </span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
                <td className="num text-muted">{s.refreshIntervalMinutes > 0 ? `${s.refreshIntervalMinutes} min` : "manual"}</td>
                <td>{EXPORT_POLICY[s.id]?.allowed ? <Badge tone="up">allowed</Badge> : <Badge tone="down">blocked</Badge>}</td>
                <td>{["alphavantage", "fred", "rss", "demo"].includes(s.id) ? <RefreshSourceButton sourceId={s.id} disabled={!configured[s.id]} reason={requirement[s.id]} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Refresh history" bodyClassName="p-0 overflow-x-auto max-h-[360px]">
        <table className="data-table">
          <thead>
            <tr>
              <th>Started</th>
              <th>Source</th>
              <th>Dataset</th>
              <th>Status</th>
              <th className="r">Records</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="num text-[11.5px]">{formatIST(r.startedAt)}</td>
                <td>{r.sourceId}</td>
                <td className="text-muted">{r.dataset}</td>
                <td>
                  <Badge tone={r.status === "success" ? "up" : r.status === "error" ? "down" : "neutral"}>{r.status}</Badge>
                </td>
                <td className="r num">{r.recordCount.toLocaleString("en-IN")}</td>
                <td className="max-w-[360px] whitespace-normal text-[11.5px] text-muted">{r.message ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Sources evaluated" bodyClassName="p-0 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Scope</th>
              <th>Status in this app</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {SOURCE_CATALOG.map((c) => (
              <tr key={c.name}>
                <td>
                  {c.link.startsWith("http") ? (
                    <a href={c.link} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      {c.name}
                    </a>
                  ) : (
                    <Link href={c.link} className="text-accent hover:underline">
                      {c.name}
                    </Link>
                  )}
                </td>
                <td className="max-w-[220px] whitespace-normal text-[11.5px] text-dim">{c.scope}</td>
                <td>
                  <Badge tone={c.status === "integrated" ? "info" : c.status === "demo" ? "demo" : "neutral"}>{c.status === "not-integrated" ? "not integrated" : c.status}</Badge>
                </td>
                <td className="max-w-[520px] whitespace-normal text-[11.5px] text-muted">{c.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <p className="text-[11px] text-faint">
        “Integrated” means an adapter exists in this codebase with timeouts, retries, rate limiting and response validation. Adapters were written from public
        documentation and have not been exercised against the live services from the build environment. API keys stay on the server and are never sent to the browser.
      </p>
    </div>
  );
}
