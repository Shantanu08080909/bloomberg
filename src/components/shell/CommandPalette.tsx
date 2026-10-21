"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, Clock, CornerDownLeft, FileText, Loader2, Search, Star } from "lucide-react";
import { apiFetch } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { fmtPct, fmtPrice } from "@/lib/format";
import { NAV_ITEMS } from "@/lib/nav";
import { NAV_ICONS } from "@/components/icons";

interface SearchHit {
  id: number;
  symbol: string;
  exchange: string;
  name: string;
  instrumentType: string;
  price: number | null;
  changePct: number | null;
  status: string;
}

type Item =
  | { kind: "instrument"; key: string; hit: SearchHit }
  | { kind: "recent"; key: string; hit: Pick<SearchHit, "symbol" | "exchange" | "name"> }
  | { kind: "page"; key: string; href: string; label: string; icon: string }
  | { kind: "watchlist"; key: string; id: number; name: string };

const RECENT_KEY = "of:recent-searches";

function readRecent(): Pick<SearchHit, "symbol" | "exchange" | "name">[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as Pick<SearchHit, "symbol" | "exchange" | "name">[]).slice(0, 6) : [];
  } catch {
    return [];
  }
}

function pushRecent(hit: Pick<SearchHit, "symbol" | "exchange" | "name">) {
  try {
    const next = [hit, ...readRecent().filter((r) => !(r.symbol === hit.symbol && r.exchange === hit.exchange))].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}

export function securityHref(exchange: string, symbol: string) {
  return `/security/${encodeURIComponent(exchange)}/${encodeURIComponent(symbol)}`;
}

export function CommandPalette({
  open,
  onClose,
  watchlists,
}: {
  open: boolean;
  onClose: () => void;
  watchlists: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<Pick<SearchHit, "symbol" | "exchange" | "name">[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHits([]);
    setActive(0);
    setRecent(readRecent());
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      setLoading(false);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      apiFetch<{ results: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q)}&limit=8`, { signal: ctrl.signal })
        .then((r) => {
          setHits(r.results);
          setError(null);
        })
        .catch((e: Error) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => setLoading(false));
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = NAV_ITEMS.filter((n) => !q || n.label.toLowerCase().includes(q) || n.keywords?.includes(q))
      .slice(0, q ? 6 : 8)
      .map<Item>((n) => ({ kind: "page", key: `p:${n.href}`, href: n.href, label: n.label, icon: n.icon }));
    const lists = watchlists
      .filter((w) => !q || w.name.toLowerCase().includes(q))
      .slice(0, 4)
      .map<Item>((w) => ({ kind: "watchlist", key: `w:${w.id}`, id: w.id, name: w.name }));
    if (!q) {
      return [...recent.map<Item>((r) => ({ kind: "recent", key: `r:${r.exchange}:${r.symbol}`, hit: r })), ...pages, ...lists];
    }
    return [...hits.map<Item>((h) => ({ kind: "instrument", key: `i:${h.id}`, hit: h })), ...pages, ...lists];
  }, [hits, query, recent, watchlists]);

  useEffect(() => setActive(0), [items.length]);

  const choose = useCallback(
    (item: Item | undefined) => {
      if (!item) return;
      if (item.kind === "instrument" || item.kind === "recent") {
        pushRecent({ symbol: item.hit.symbol, exchange: item.hit.exchange, name: item.hit.name });
        router.push(securityHref(item.hit.exchange, item.hit.symbol));
      } else if (item.kind === "page") router.push(item.href);
      else router.push(`/watchlists?id=${item.id}`);
      onClose();
    },
    [onClose, router],
  );

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  let lastKind: string | null = null;
  const sectionLabel: Record<Item["kind"], string> = {
    instrument: "Securities",
    recent: "Recent searches",
    page: "Go to",
    watchlist: "Watchlists",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-3 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search securities and pages"
        className="w-full max-w-xl overflow-hidden rounded-lg border border-line-strong bg-panel shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-4 text-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbol, company, ISIN or page…"
            className="h-11 flex-1 bg-transparent text-[14px] text-fg placeholder:text-faint focus:outline-none"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
          />
          {loading ? <Loader2 className="size-4 animate-spin text-muted" aria-label="Searching" /> : null}
          <kbd className="rounded border border-line px-1.5 text-[10px] text-muted">Esc</kbd>
        </div>
        <ul id={listId} role="listbox" className="max-h-[55vh] overflow-y-auto py-1">
          {error ? <li className="px-3 py-2 text-[12px] text-down">{error}</li> : null}
          {query.trim() && !loading && hits.length === 0 && !error ? (
            <li className="px-3 py-2 text-[12px] text-muted">No securities match “{query.trim()}”.</li>
          ) : null}
          {items.map((item, i) => {
            const header = item.kind !== lastKind ? sectionLabel[item.kind] : null;
            lastKind = item.kind;
            const selected = i === active;
            return (
              <li key={item.key} role="presentation">
                {header ? <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">{header}</div> : null}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(item)}
                  className={cn("mx-1 flex cursor-pointer items-center gap-3 rounded px-2 py-1.5", selected ? "bg-raised" : "")}
                >
                  {item.kind === "instrument" ? (
                    <>
                      <span className="num w-24 shrink-0 truncate font-semibold text-accent-strong">{item.hit.symbol}</span>
                      <span className="min-w-0 flex-1 truncate text-dim">{item.hit.name}</span>
                      <span className="text-[10px] text-faint">{item.hit.exchange}</span>
                      <span className="num w-20 text-right text-fg">{fmtPrice(item.hit.price)}</span>
                      <span className={cn("num w-16 text-right", (item.hit.changePct ?? 0) >= 0 ? "text-up" : "text-down")}>{fmtPct(item.hit.changePct)}</span>
                    </>
                  ) : item.kind === "recent" ? (
                    <>
                      <Clock className="size-3.5 text-faint" aria-hidden />
                      <span className="num w-24 shrink-0 font-semibold text-accent-strong">{item.hit.symbol}</span>
                      <span className="min-w-0 flex-1 truncate text-dim">{item.hit.name}</span>
                      <span className="text-[10px] text-faint">{item.hit.exchange}</span>
                    </>
                  ) : item.kind === "page" ? (
                    <>
                      {(() => {
                        const Icon = NAV_ICONS[item.icon] ?? FileText;
                        return <Icon className="size-3.5 text-faint" aria-hidden />;
                      })()}
                      <span className="flex-1 text-dim">{item.label}</span>
                      <ArrowRight className="size-3.5 text-faint" aria-hidden />
                    </>
                  ) : (
                    <>
                      <Star className="size-3.5 text-faint" aria-hidden />
                      <span className="flex-1 text-dim">{item.name}</span>
                    </>
                  )}
                  {selected ? <CornerDownLeft className="size-3.5 text-muted" aria-hidden /> : null}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-3 border-t border-line px-3 py-1.5 text-[10.5px] text-faint">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>Esc close</span>
          <span className="ml-auto">Ctrl/⌘ K or / to search</span>
        </div>
      </div>
    </div>
  );
}
