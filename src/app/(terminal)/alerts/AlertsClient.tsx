"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCheck, Loader2, Play, Trash2 } from "lucide-react";
import { InstrumentPicker, type PickedInstrument } from "@/components/InstrumentPicker";
import { Badge, buttonClass, Callout, Field, inputClass, StatusBadge } from "@/components/ui";
import { apiFetch } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { securityHref } from "@/lib/dto";
import type { DisplayStatus } from "@/lib/market/types";

export interface AlertDTO {
  id: number;
  kind: "PRICE_ABOVE" | "PRICE_BELOW" | "PCT_UP" | "PCT_DOWN";
  threshold: number;
  active: boolean;
  repeat: boolean;
  note: string | null;
  symbol: string;
  exchange: string;
  name: string;
  sourceId: string;
  lastCheckedAt: string | null;
  lastTriggeredAt: string | null;
  createdAt: string;
}

export interface NotificationDTO {
  id: number;
  channel: string;
  title: string;
  body: string;
  dataStatus: string | null;
  deliveryStatus: string;
  createdAt: string;
  readAt: string | null;
}

const KIND_LABEL: Record<AlertDTO["kind"], string> = {
  PRICE_ABOVE: "Price at or above",
  PRICE_BELOW: "Price at or below",
  PCT_UP: "Day change at or above +",
  PCT_DOWN: "Day change at or below −",
};

const fmt = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "—");

export function AlertsClient({
  alerts: initialAlerts,
  notifications: initialNotes,
  preset,
}: {
  alerts: AlertDTO[];
  notifications: NotificationDTO[];
  preset: PickedInstrument | null;
}) {
  const router = useRouter();
  const [alerts, setAlerts] = useState(initialAlerts);
  const [notes, setNotes] = useState(initialNotes);
  const [inst, setInst] = useState<PickedInstrument | null>(preset);
  const [kind, setKind] = useState<AlertDTO["kind"]>("PRICE_ABOVE");
  const [threshold, setThreshold] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  const reload = async () => {
    const [a, n] = await Promise.all([apiFetch<{ alerts: { alert: AlertDTO; symbol: string; exchange: string; name: string; sourceId: string }[] }>("/api/alerts"), apiFetch<{ notifications: NotificationDTO[] }>("/api/notifications")]);
    setAlerts(a.alerts.map((r) => ({ ...r.alert, symbol: r.symbol, exchange: r.exchange, name: r.name, sourceId: r.sourceId })));
    setNotes(n.notifications);
    router.refresh();
  };

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!inst) return setError("Choose a security");
    try {
      await apiFetch("/api/alerts", { body: { instrumentId: inst.id, kind, threshold: Number(threshold), repeat, note: note || null } });
      setThreshold("");
      setNote("");
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function runCheck() {
    setChecking(true);
    setError(null);
    try {
      const { result } = await apiFetch<{ result: { checked: number; triggered: number; skippedStale: number; noQuote: number } }>("/api/alerts/check", { method: "POST" });
      setCheckResult(`Checked ${result.checked} active alert(s): ${result.triggered} triggered, ${result.skippedStale} skipped (stale data), ${result.noQuote} without a quote.`);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={create} className="grid gap-3 rounded-panel border border-line bg-panel p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_200px_140px_minmax(0,1fr)_auto]" aria-label="Create alert">
        <Field label="Security">
          <InstrumentPicker value={inst} onChange={setInst} />
        </Field>
        <Field label="Condition" htmlFor="al-kind">
          <select id="al-kind" value={kind} onChange={(e) => setKind(e.target.value as AlertDTO["kind"])} className={inputClass}>
            <option value="PRICE_ABOVE">Price at or above</option>
            <option value="PRICE_BELOW">Price at or below</option>
            <option value="PCT_UP">Day change ≥ +x%</option>
            <option value="PCT_DOWN">Day change ≤ −x%</option>
          </select>
        </Field>
        <Field label={kind.startsWith("PCT") ? "Percent" : "Price (₹)"} htmlFor="al-th">
          <input id="al-th" type="number" min="0" step="any" required value={threshold} onChange={(e) => setThreshold(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Note (optional)" htmlFor="al-note">
          <input id="al-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={inputClass} />
        </Field>
        <div className="flex items-end gap-3">
          <label className="flex h-8 items-center gap-1.5 text-[12px] text-dim" title="Fire again each time a newer quote meets the condition">
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} className="accent-[var(--color-accent)]" />
            Repeat
          </label>
          <button type="submit" className={buttonClass("primary")}>
            Create alert
          </button>
        </div>
      </form>
      {error ? <Callout tone="error">{error}</Callout> : null}

      <section className="rounded-panel border border-line bg-panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">Your alerts</h2>
          <button type="button" onClick={runCheck} className={cn(buttonClass("default", "sm"), "ml-auto")} disabled={checking}>
            {checking ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Check now
          </button>
        </div>
        {checkResult ? <p className="border-b border-line px-3 py-1.5 text-[11.5px] text-dim">{checkResult}</p> : null}
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Security</th>
                <th>Condition</th>
                <th>Status</th>
                <th>Last checked</th>
                <th>Last fired (data time)</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={securityHref(a.exchange, a.symbol)} className="num font-semibold text-accent-strong hover:underline">
                      {a.symbol}
                    </Link>
                    <span className="ml-1 text-[10px] text-faint">{a.exchange}</span>
                    {a.sourceId === "demo" ? <Badge tone="demo" className="ml-2">Demo data</Badge> : null}
                  </td>
                  <td className="num">
                    {KIND_LABEL[a.kind]}
                    {a.kind.startsWith("PCT") ? `${a.threshold}%` : ` ₹${a.threshold}`}
                    {a.repeat ? <span className="ml-1 text-[10.5px] text-faint">(repeat)</span> : null}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiFetch(`/api/alerts/${a.id}`, { method: "PATCH", body: { active: !a.active } });
                          setAlerts((xs) => xs.map((x) => (x.id === a.id ? { ...x, active: !a.active } : x)));
                        } catch (err) {
                          setError((err as Error).message);
                        }
                      }}
                      aria-pressed={a.active}
                      title={a.active ? "Pause alert" : "Re-activate alert"}
                    >
                      <Badge tone={a.active ? "up" : "neutral"}>{a.active ? "Active" : a.lastTriggeredAt ? "Fired" : "Paused"}</Badge>
                    </button>
                  </td>
                  <td className="num text-[11.5px] text-muted">{fmt(a.lastCheckedAt)}</td>
                  <td className="num text-[11.5px] text-muted">{fmt(a.lastTriggeredAt)}</td>
                  <td className="max-w-[200px] truncate text-muted">{a.note ?? ""}</td>
                  <td>
                    <button
                      type="button"
                      className="rounded p-1 text-faint hover:text-down"
                      aria-label={`Delete alert on ${a.symbol}`}
                      onClick={async () => {
                        try {
                          await apiFetch(`/api/alerts/${a.id}`, { method: "DELETE" });
                          setAlerts((xs) => xs.filter((x) => x.id !== a.id));
                        } catch (err) {
                          setError((err as Error).message);
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {alerts.length === 0 ? <p className="px-3 py-8 text-center text-[12px] text-muted">No alerts. Create one above.</p> : null}
        </div>
      </section>

      <section id="notifications" className="rounded-panel border border-line bg-panel">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">Notification history</h2>
          <button
            type="button"
            className={cn(buttonClass("ghost", "sm"), "ml-auto")}
            disabled={!notes.some((n) => !n.readAt)}
            onClick={async () => {
              await apiFetch("/api/notifications", { method: "PATCH", body: {} }).catch(() => {});
              setNotes((ns) => ns.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
              router.refresh();
            }}
          >
            <CheckCheck className="size-3.5" /> Mark all read
          </button>
        </div>
        {notes.length ? (
          <ul className="divide-y divide-line">
            {notes.map((n) => (
              <li key={n.id} className={cn("flex gap-3 px-3 py-2", !n.readAt && "bg-accent-soft/30")}>
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent")} aria-label={n.readAt ? undefined : "Unread"} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] font-medium text-fg">{n.title}</span>
                    {n.dataStatus ? <StatusBadge status={n.dataStatus as DisplayStatus} /> : null}
                    <Badge>{n.channel === "email" ? `email · ${n.deliveryStatus}` : "in-app"}</Badge>
                  </div>
                  <p className="text-[12px] text-muted">{n.body}</p>
                  <p className="text-[10.5px] text-faint">{fmt(n.createdAt)} IST</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-8 text-center text-[12px] text-muted">No notifications yet.</p>
        )}
      </section>
    </div>
  );
}
