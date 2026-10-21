"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus, Star } from "lucide-react";
import { apiFetch } from "@/lib/client/api";
import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Add/remove an instrument from any of the user's watchlists. */
export function WatchlistButton({
  instrumentId,
  watchlists,
  containing,
}: {
  instrumentId: number;
  watchlists: { id: number; name: string }[];
  containing: number[];
}) {
  const [open, setOpen] = useState(false);
  const [inLists, setInLists] = useState<Set<number>>(new Set(containing));
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function toggle(id: number) {
    setBusy(id);
    setError(null);
    const has = inLists.has(id);
    try {
      await apiFetch(`/api/watchlists/${id}/items`, { method: has ? "DELETE" : "POST", body: { instrumentId } });
      setInLists((s) => {
        const n = new Set(s);
        if (has) n.delete(id);
        else n.add(id);
        return n;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const any = inLists.size > 0;
  return (
    <div className="relative" ref={ref}>
      <button type="button" className={buttonClass(any ? "default" : "primary", "sm")} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <Star className={cn("size-3.5", any && "fill-demo text-demo")} aria-hidden />
        {any ? `In ${inLists.size} watchlist${inLists.size > 1 ? "s" : ""}` : "Add to watchlist"}
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-8 z-30 w-56 rounded-md border border-line-strong bg-panel py-1 shadow-xl">
          {watchlists.length === 0 ? <p className="px-3 py-2 text-[12px] text-muted">No watchlists yet. Create one on the Watchlists page.</p> : null}
          {watchlists.map((w) => (
            <button
              key={w.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={inLists.has(w.id)}
              onClick={() => toggle(w.id)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-dim hover:bg-raised hover:text-fg"
            >
              {busy === w.id ? <Loader2 className="size-3.5 animate-spin" /> : inLists.has(w.id) ? <Check className="size-3.5 text-accent" /> : <Plus className="size-3.5 text-faint" />}
              <span className="truncate">{w.name}</span>
            </button>
          ))}
          {error ? <p className="px-3 py-1 text-[11px] text-down">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
