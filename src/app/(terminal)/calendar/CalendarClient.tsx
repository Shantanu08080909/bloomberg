"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge, buttonClass, Callout, Field, inputClass } from "@/components/ui";
import { apiFetch } from "@/lib/client/api";
import { cn } from "@/lib/cn";

export interface EventDTO {
  id: number;
  title: string;
  country: string;
  scheduledAt: string;
  importance: string;
  notes: string | null;
  isSample: boolean;
  mine: boolean;
}

const fmtDay = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
const fmtTime = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));

export function CalendarClient({ initial }: { initial: EventDTO[] }) {
  const [events, setEvents] = useState(initial);
  const [country, setCountry] = useState("ALL");
  const [importance, setImportance] = useState("ALL");
  const [showSample, setShowSample] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", country: "India", date: new Date().toISOString().slice(0, 10), time: "10:00", importance: "medium", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();

  const filtered = useMemo(
    () => events.filter((e) => (country === "ALL" || e.country === country) && (importance === "ALL" || e.importance === importance) && (showSample || !e.isSample)),
    [events, country, importance, showSample],
  );
  const upcoming = filtered.filter((e) => new Date(e.scheduledAt).getTime() >= now);
  const past = filtered.filter((e) => new Date(e.scheduledAt).getTime() < now).reverse();
  const countries = [...new Set(events.map((e) => e.country))];

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      // Interpret the entered wall-clock time as IST.
      const scheduledAt = new Date(`${form.date}T${form.time}:00+05:30`).toISOString();
      const { event } = await apiFetch<{ event: { id: number; title: string; country: string; scheduledAt: string; importance: string; notes: string | null } }>("/api/calendar", {
        body: { title: form.title, country: form.country, scheduledAt, importance: form.importance, notes: form.notes || null },
      });
      setEvents((xs) => [...xs, { ...event, isSample: false, mine: true }].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
      setForm((f) => ({ ...f, title: "", notes: "" }));
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(id: number) {
    setError(null);
    try {
      await apiFetch(`/api/calendar/${id}`, { method: "DELETE" });
      setEvents((xs) => xs.filter((x) => x.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const List = ({ items, label }: { items: EventDTO[]; label: string }) => {
    let lastDay = "";
    return (
      <section className="rounded-panel border border-line bg-panel">
        <h2 className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">
          {label} <span className="num font-normal text-faint">({items.length})</span>
        </h2>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-muted">{label === "Upcoming" ? "No upcoming events. No live release calendar is connected — add events you want to track." : "No past events."}</p>
        ) : (
          <ul>
            {items.map((e) => {
              const d = dayKey(e.scheduledAt);
              const header = d !== lastDay ? fmtDay(e.scheduledAt) : null;
              lastDay = d;
              return (
                <li key={e.id}>
                  {header ? <div className="border-b border-line bg-panel-2 px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-faint">{header}</div> : null}
                  <div className="flex items-center gap-3 border-b border-line/60 px-3 py-2 text-[12.5px]">
                    <span className="num w-12 shrink-0 text-[11px] text-muted">{fmtTime(e.scheduledAt)}</span>
                    <span className="w-24 shrink-0 truncate text-[11px] text-faint">{e.country}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-fg">{e.title}</div>
                      {e.notes ? <div className="truncate text-[11px] text-muted">{e.notes}</div> : null}
                    </div>
                    {e.isSample ? <Badge tone="demo">Sample</Badge> : e.mine ? <Badge>Yours</Badge> : <Badge tone="info">Source</Badge>}
                    <Badge tone={e.importance === "high" ? "down" : e.importance === "medium" ? "info" : "neutral"}>{e.importance}</Badge>
                    {e.mine ? (
                      <button type="button" onClick={() => remove(e.id)} className="rounded p-1 text-faint hover:text-down" aria-label={`Delete ${e.title}`}>
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : (
                      <span className="w-[22px]" />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-panel px-3 py-2">
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          Country
          <select value={country} onChange={(e) => setCountry(e.target.value)} className="h-7 rounded border border-line-strong bg-bg px-2 text-[12px] text-fg">
            <option value="ALL">All</option>
            {countries.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          Importance
          <select value={importance} onChange={(e) => setImportance(e.target.value)} className="h-7 rounded border border-line-strong bg-bg px-2 text-[12px] text-fg">
            <option value="ALL">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-dim">
          <input type="checkbox" checked={showSample} onChange={(e) => setShowSample(e.target.checked)} className="accent-[var(--color-accent)]" />
          Show sample events
        </label>
        <button type="button" className={cn(buttonClass("primary", "sm"), "ml-auto")} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Plus className="size-3.5" aria-hidden /> Add event
        </button>
      </div>
      {open ? (
        <form onSubmit={add} className="grid gap-3 rounded-panel border border-line bg-panel p-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Add event">
          <div className="sm:col-span-2">
            <Field label="Event" htmlFor="ev-title">
              <input id="ev-title" required maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} placeholder="e.g. CPI release" />
            </Field>
          </div>
          <Field label="Country" htmlFor="ev-country">
            <input id="ev-country" required maxLength={60} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Date" htmlFor="ev-date">
            <input id="ev-date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Time (IST)" htmlFor="ev-time">
            <input id="ev-time" type="time" required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Importance" htmlFor="ev-imp">
            <select id="ev-imp" value={form.importance} onChange={(e) => setForm({ ...form, importance: e.target.value })} className={inputClass}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </Field>
          <div className="sm:col-span-3 lg:col-span-5">
            <Field label="Notes / source" htmlFor="ev-notes">
              <input id="ev-notes" maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} placeholder="Where did this date come from?" />
            </Field>
          </div>
          <div className="flex items-end">
            <button type="submit" className={buttonClass("primary")}>
              Save event
            </button>
          </div>
        </form>
      ) : null}
      {error ? <Callout tone="error">{error}</Callout> : null}
      <div className="grid gap-3 xl:grid-cols-2">
        <List items={upcoming} label="Upcoming" />
        <List items={past} label="Past" />
      </div>
    </div>
  );
}
