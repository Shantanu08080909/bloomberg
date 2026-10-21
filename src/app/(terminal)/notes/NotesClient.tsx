"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { InstrumentPicker, type PickedInstrument } from "@/components/InstrumentPicker";
import { Badge, buttonClass, Callout, EmptyState, Field, inputClass } from "@/components/ui";
import { apiFetch } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { securityHref } from "@/lib/dto";

export interface NoteDTO {
  id: number;
  title: string;
  body: string;
  tags: string[];
  instrument: PickedInstrument | null;
  updatedAt: string;
}

const fmt = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

export function NotesClient({ initial, openId, newFor }: { initial: NoteDTO[]; openId: number | null; newFor: PickedInstrument | null | "blank" }) {
  const [notes, setNotes] = useState(initial);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<number | "new" | null>(newFor ? "new" : openId ?? initial[0]?.id ?? null);
  const current = typeof selected === "number" ? notes.find((n) => n.id === selected) ?? null : null;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [inst, setInst] = useState<PickedInstrument | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setSavedAt(null);
    if (selected === "new") {
      setTitle("");
      setBody("");
      setTags("");
      setInst(newFor && newFor !== "blank" ? newFor : null);
    } else if (current) {
      setTitle(current.title);
      setBody(current.body);
      setTags(current.tags.join(", "));
      setInst(current.instrument);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const visible = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? notes.filter((x) => `${x.title} ${x.body} ${x.tags.join(" ")} ${x.instrument?.symbol ?? ""}`.toLowerCase().includes(n)) : notes;
  }, [notes, q]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      title,
      body,
      instrumentId: inst?.id ?? null,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 10),
    };
    try {
      if (selected === "new") {
        const { note } = await apiFetch<{ note: { id: number; updatedAt: string } }>("/api/notes", { body: payload });
        const dto: NoteDTO = { id: note.id, title: payload.title, body: payload.body, tags: payload.tags, instrument: inst, updatedAt: note.updatedAt };
        setNotes((ns) => [dto, ...ns]);
        setSelected(note.id);
      } else if (current) {
        const { note } = await apiFetch<{ note: { updatedAt: string } }>(`/api/notes/${current.id}`, { method: "PATCH", body: payload });
        setNotes((ns) => [{ ...current, ...payload, instrument: inst, updatedAt: note.updatedAt }, ...ns.filter((x) => x.id !== current.id)]);
      }
      setSavedAt(new Date().toISOString());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!current || !confirm(`Delete note “${current.title}”?`)) return;
    try {
      await apiFetch(`/api/notes/${current.id}`, { method: "DELETE" });
      const rest = notes.filter((x) => x.id !== current.id);
      setNotes(rest);
      setSelected(rest[0]?.id ?? null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="flex min-h-[400px] flex-col rounded-panel border border-line bg-panel">
        <div className="flex gap-1.5 border-b border-line p-2">
          <label className="relative flex-1">
            <span className="sr-only">Search notes</span>
            <Search className="pointer-events-none absolute left-2 top-2 size-3.5 text-faint" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" className={cn(inputClass, "h-7 pl-7")} />
          </label>
          <button type="button" onClick={() => setSelected("new")} className={buttonClass("primary", "sm")} aria-label="New note">
            <Plus className="size-3.5" />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto" role="listbox" aria-label="Notes">
          {visible.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected === n.id}
                onClick={() => setSelected(n.id)}
                className={cn("w-full border-b border-line/60 px-3 py-2 text-left", selected === n.id ? "bg-raised" : "hover:bg-panel-2")}
              >
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">{n.title}</span>
                  {n.instrument ? <span className="num text-[10.5px] text-accent">{n.instrument.symbol}</span> : null}
                </div>
                <p className="line-clamp-1 text-[11.5px] text-muted">{n.body || "Empty note"}</p>
                <p className="text-[10px] text-faint">{fmt(n.updatedAt)}</p>
              </button>
            </li>
          ))}
          {visible.length === 0 ? <li className="px-3 py-6 text-center text-[12px] text-muted">{notes.length ? "No notes match." : "No notes yet."}</li> : null}
        </ul>
      </aside>
      <section className="rounded-panel border border-line bg-panel">
        {selected === null ? (
          <EmptyState title="No note selected" action={<button type="button" className={buttonClass("primary")} onClick={() => setSelected("new")}>New note</button>} />
        ) : (
          <form onSubmit={save} className="flex flex-col gap-3 p-3">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_280px]">
              <Field label="Title" htmlFor="note-title">
                <input id="note-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} className={inputClass} />
              </Field>
              <Field label="Linked security (optional)">
                <InstrumentPicker value={inst} onChange={setInst} />
              </Field>
            </div>
            <Field label="Note" htmlFor="note-body" hint="Plain text. Stored only in your local database.">
              <textarea id="note-body" value={body} onChange={(e) => setBody(e.target.value)} rows={16} maxLength={50000} className="min-h-[300px] w-full rounded border border-line-strong bg-bg p-2.5 font-mono text-[12.5px] leading-relaxed text-fg focus:border-accent focus:outline-none" />
            </Field>
            <Field label="Tags (comma separated)" htmlFor="note-tags">
              <input id="note-tags" value={tags} onChange={(e) => setTags(e.target.value)} className={inputClass} placeholder="thesis, banking, follow-up" />
            </Field>
            {error ? <Callout tone="error">{error}</Callout> : null}
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" className={buttonClass("primary")} disabled={busy || !title.trim()}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {selected === "new" ? "Create note" : "Save"}
              </button>
              {current ? (
                <button type="button" onClick={remove} className={buttonClass("danger")}>
                  <Trash2 className="size-3.5" aria-hidden /> Delete
                </button>
              ) : null}
              {inst ? (
                <Link href={securityHref(inst.exchange, inst.symbol)} className="text-[12px] text-accent hover:underline">
                  Open {inst.symbol}
                </Link>
              ) : null}
              {current?.tags.map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
              {savedAt ? <span className="ml-auto text-[11px] text-up">Saved {fmt(savedAt)}</span> : current ? <span className="ml-auto text-[11px] text-faint">Last updated {fmt(current.updatedAt)}</span> : null}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
