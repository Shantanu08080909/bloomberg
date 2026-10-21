"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { apiFetch } from "@/lib/client/api";
import { cn } from "@/lib/cn";

export interface PickedInstrument {
  id: number;
  symbol: string;
  exchange: string;
  name: string;
}

/** Autocomplete input for choosing an instrument via the server-side search API. */
export function InstrumentPicker({
  value,
  onChange,
  placeholder = "Search symbol or company…",
  id,
  types,
  autoFocus,
}: {
  value: PickedInstrument | null;
  onChange: (v: PickedInstrument | null) => void;
  placeholder?: string;
  id?: string;
  types?: string[];
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<(PickedInstrument & { instrumentType: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      apiFetch<{ results: (PickedInstrument & { instrumentType: string })[] }>(`/api/search?q=${encodeURIComponent(q)}&limit=10`, { signal: ctrl.signal })
        .then((r) => {
          setResults(types ? r.results.filter((x) => types.includes(x.instrumentType)) : r.results);
          setActive(0);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, types]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (value) {
    return (
      <div className="flex h-8 items-center gap-2 rounded border border-line-strong bg-bg px-2.5 text-[12.5px]">
        <span className="num font-semibold text-accent-strong">{value.symbol}</span>
        <span className="text-[10.5px] text-faint">{value.exchange}</span>
        <span className="min-w-0 flex-1 truncate text-dim">{value.name}</span>
        <button type="button" onClick={() => onChange(null)} className="rounded p-0.5 text-muted hover:text-fg" aria-label="Clear selection">
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  const pick = (r: PickedInstrument) => {
    onChange({ id: r.id, symbol: r.symbol, exchange: r.exchange, name: r.name });
    setQ("");
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <Search className="pointer-events-none absolute left-2 top-2 size-3.5 text-faint" aria-hidden />
      <input
        id={id}
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            pick(results[active]!);
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        role="combobox"
        aria-controls={listId}
        aria-expanded={open && results.length > 0}
        aria-autocomplete="list"
        className="h-8 w-full rounded border border-line-strong bg-bg pl-7 pr-7 text-[12.5px] text-fg placeholder:text-faint focus:border-accent focus:outline-none"
      />
      {loading ? <Loader2 className="absolute right-2 top-2 size-3.5 animate-spin text-muted" aria-hidden /> : null}
      {open && results.length > 0 ? (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line-strong bg-panel py-1 shadow-xl">
          {results.map((r, i) => (
            <li
              key={r.id}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
              className={cn("flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[12.5px]", i === active && "bg-raised")}
            >
              <span className="num w-24 shrink-0 font-semibold text-accent-strong">{r.symbol}</span>
              <span className="min-w-0 flex-1 truncate text-dim">{r.name}</span>
              <span className="text-[10px] text-faint">{r.exchange}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
