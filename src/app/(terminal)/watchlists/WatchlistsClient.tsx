"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { InstrumentPicker, type PickedInstrument } from "@/components/InstrumentPicker";
import { QuoteTable } from "@/components/QuoteTable";
import { buttonClass, Callout, EmptyState, inputClass } from "@/components/ui";
import { apiFetch, useApi } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import type { QuoteDTO } from "@/lib/dto";

interface WL {
  id: number;
  name: string;
  itemCount: number;
}

export function WatchlistsClient({ initial }: { initial: WL[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [lists, setLists] = useState<WL[]>(initial);
  const requested = Number(params.get("id"));
  const [selected, setSelected] = useState<number | null>(initial.find((l) => l.id === requested)?.id ?? initial[0]?.id ?? null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<PickedInstrument | null>(null);
  const { data, loading, refresh, error: loadError } = useApi<{ items: QuoteDTO[] }>(selected ? `/api/watchlists/${selected}` : null);

  useEffect(() => {
    if (selected) router.replace(`/watchlists?id=${selected}`, { scroll: false });
  }, [selected, router]);

  const current = lists.find((l) => l.id === selected) ?? null;

  async function act<T>(fn: () => Promise<T>) {
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    }
  }

  const create = () =>
    act(async () => {
      const { watchlist } = await apiFetch<{ watchlist: WL }>("/api/watchlists", { body: { name: newName } });
      setLists((l) => [...l, { ...watchlist, itemCount: 0 }]);
      setSelected(watchlist.id);
      setNewName("");
    });

  const rename = () =>
    act(async () => {
      if (!current || !renaming) return;
      await apiFetch(`/api/watchlists/${current.id}`, { method: "PATCH", body: { name: renaming } });
      setLists((l) => l.map((x) => (x.id === current.id ? { ...x, name: renaming } : x)));
      setRenaming(null);
    });

  const remove = () =>
    act(async () => {
      if (!current || !confirm(`Delete watchlist “${current.name}”? This cannot be undone.`)) return;
      await apiFetch(`/api/watchlists/${current.id}`, { method: "DELETE" });
      const rest = lists.filter((x) => x.id !== current.id);
      setLists(rest);
      setSelected(rest[0]?.id ?? null);
    });

  const addItem = (inst: PickedInstrument | null) => {
    setAdding(inst);
    if (!inst || !current) return;
    void act(async () => {
      await apiFetch(`/api/watchlists/${current.id}/items`, { body: { instrumentId: inst.id } });
      setLists((l) => l.map((x) => (x.id === current.id ? { ...x, itemCount: x.itemCount + 1 } : x)));
      setAdding(null);
      refresh();
    });
  };

  const removeItem = (instrumentId: number) =>
    act(async () => {
      if (!current) return;
      await apiFetch(`/api/watchlists/${current.id}/items`, { method: "DELETE", body: { instrumentId } });
      setLists((l) => l.map((x) => (x.id === current.id ? { ...x, itemCount: Math.max(0, x.itemCount - 1) } : x)));
      refresh();
    });

  return (
    <div className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="rounded-panel border border-line bg-panel">
        <h2 className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">Your watchlists</h2>
        <ul className="p-1.5" role="listbox" aria-label="Watchlists">
          {lists.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected === l.id}
                onClick={() => setSelected(l.id)}
                className={cn("flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[12.5px]", selected === l.id ? "bg-raised text-fg" : "text-dim hover:bg-panel-2")}
              >
                <span className="truncate">{l.name}</span>
                <span className="num text-[11px] text-faint">{l.itemCount}</span>
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-1.5 border-t border-line p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New watchlist" aria-label="New watchlist name" className={cn(inputClass, "h-7")} maxLength={80} />
          <button type="submit" className={buttonClass("primary", "sm")} disabled={!newName.trim()} aria-label="Create watchlist">
            <Plus className="size-3.5" />
          </button>
        </form>
      </aside>

      <section className="min-w-0 rounded-panel border border-line bg-panel">
        {current ? (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
              {renaming !== null ? (
                <form
                  className="flex items-center gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void rename();
                  }}
                >
                  <input value={renaming} onChange={(e) => setRenaming(e.target.value)} className={cn(inputClass, "h-7 w-56")} autoFocus aria-label="Watchlist name" maxLength={80} />
                  <button type="submit" className={buttonClass("primary", "sm")}>
                    Save
                  </button>
                  <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setRenaming(null)} aria-label="Cancel rename">
                    <X className="size-3.5" />
                  </button>
                </form>
              ) : (
                <>
                  <h2 className="text-[13px] font-semibold">{current.name}</h2>
                  <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setRenaming(current.name)} aria-label="Rename watchlist">
                    <Pencil className="size-3.5" />
                  </button>
                  <button type="button" className={buttonClass("danger", "sm")} onClick={remove}>
                    <Trash2 className="size-3.5" aria-hidden /> Delete
                  </button>
                </>
              )}
              <div className="ml-auto w-full sm:w-80">
                <InstrumentPicker value={adding} onChange={addItem} placeholder="Add symbol to this watchlist…" />
              </div>
            </div>
            {error || loadError ? (
              <div className="p-3">
                <Callout tone="error">{error ?? loadError}</Callout>
              </div>
            ) : null}
            {loading && !data ? (
              <div className="h-40 animate-pulse bg-panel-2" />
            ) : (
              <QuoteTable
                rows={data?.items ?? []}
                columns={["symbol", "name", "exchange", "price", "change", "changePct", "range", "volume", "status"]}
                extra={[
                  {
                    key: "remove",
                    header: "",
                    render: (r) => (
                      <button type="button" onClick={() => removeItem(r.id)} className="rounded p-1 text-faint hover:text-down" aria-label={`Remove ${r.symbol}`}>
                        <X className="size-3.5" />
                      </button>
                    ),
                  },
                ]}
                empty="This watchlist is empty. Use the search box above to add securities."
                caption={`Watchlist ${current.name}`}
              />
            )}
          </>
        ) : (
          <EmptyState title="No watchlists">Create a watchlist on the left to start tracking securities.</EmptyState>
        )}
      </section>
    </div>
  );
}
