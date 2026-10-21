"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { buttonClass, Callout, Field, inputClass } from "@/components/ui";
import { apiFetch } from "@/lib/client/api";

interface Profile {
  displayName: string;
  notificationPrefs: { inApp: boolean; email: boolean; emailAddress?: string };
  preferences: { riskFreeRate?: number; defaultRange?: string };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-panel border border-line bg-panel">
      <h2 className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">{title}</h2>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function SettingsClient({ profile, smtpConfigured, username }: { profile: Profile; smtpConfigured: boolean; username: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [inApp, setInApp] = useState(profile.notificationPrefs.inApp);
  const [email, setEmail] = useState(profile.notificationPrefs.email);
  const [address, setAddress] = useState(profile.notificationPrefs.emailAddress ?? "");
  const [rf, setRf] = useState(((profile.preferences.riskFreeRate ?? 0.065) * 100).toString());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        body: {
          displayName,
          notificationPrefs: { inApp, email, emailAddress: address },
          preferences: { riskFreeRate: Number(rf) / 100 },
        },
      });
      setMsg({ ok: true, text: "Settings saved." });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (pw.next !== pw.confirm) return setPwMsg({ ok: false, text: "New passwords do not match" });
    try {
      await apiFetch("/api/settings/password", { body: { current: pw.current, next: pw.next } });
      setPwMsg({ ok: true, text: "Password changed. All sessions were signed out — sign in again." });
      setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      setPwMsg({ ok: false, text: (err as Error).message });
    }
  }

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <form onSubmit={saveProfile} className="flex flex-col gap-3">
        <Section title="Profile">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Username">
              <input value={username} disabled className={inputClass} />
            </Field>
            <Field label="Display name" htmlFor="set-name">
              <input id="set-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} required className={inputClass} />
            </Field>
          </div>
        </Section>
        <Section title="Notifications">
          <div className="flex flex-col gap-2 text-[12.5px]">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={inApp} onChange={(e) => setInApp(e.target.checked)} className="accent-[var(--color-accent)]" />
              In-app notifications for triggered alerts
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} className="accent-[var(--color-accent)]" />
              Email notifications
            </label>
            {email ? (
              <Field label="Email address" htmlFor="set-email">
                <input id="set-email" type="email" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} maxLength={200} />
              </Field>
            ) : null}
            {email && !smtpConfigured ? <Callout tone="warn">SMTP is not configured on this server (SMTP_HOST, SMTP_FROM), so no emails will be sent. Delivery attempts are recorded as “not_configured”.</Callout> : null}
          </div>
        </Section>
        <Section title="Analytics defaults">
          <Field label="Default risk-free rate (% per year)" htmlFor="set-rf" hint="Used as the starting value in Risk Analytics. Your assumption.">
            <input id="set-rf" type="number" min="0" max="30" step="0.1" value={rf} onChange={(e) => setRf(e.target.value)} className={inputClass} />
          </Field>
        </Section>
        <div className="flex items-center gap-3">
          <button type="submit" className={buttonClass("primary")} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null} Save settings
          </button>
          {msg ? <span className={msg.ok ? "text-[12px] text-up" : "text-[12px] text-down"}>{msg.text}</span> : null}
        </div>
      </form>
      <form onSubmit={changePassword} className="flex flex-col gap-3">
        <Section title="Change password">
          <div className="grid gap-3">
            <Field label="Current password" htmlFor="pw-cur">
              <input id="pw-cur" type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className={inputClass} />
            </Field>
            <Field label="New password" htmlFor="pw-new" hint="At least 10 characters, with a letter and a number.">
              <input id="pw-new" type="password" autoComplete="new-password" required value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Confirm new password" htmlFor="pw-confirm">
              <input id="pw-confirm" type="password" autoComplete="new-password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} className={inputClass} />
            </Field>
            <div className="flex items-center gap-3">
              <button type="submit" className={buttonClass("default")}>
                Change password
              </button>
              {pwMsg ? <span className={pwMsg.ok ? "text-[12px] text-up" : "text-[12px] text-down"}>{pwMsg.text}</span> : null}
            </div>
          </div>
        </Section>
      </form>
    </div>
  );
}
