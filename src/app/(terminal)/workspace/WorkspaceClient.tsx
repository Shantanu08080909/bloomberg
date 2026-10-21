"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus, RotateCcw, Save, Star, Trash2, X } from "lucide-react";
import { MarketHeatmap, type HeatCell } from "@/components/charts/MarketHeatmap";
import { InstrumentChart } from "@/components/InstrumentChart";
import { InstrumentPicker } from "@/components/InstrumentPicker";
import { NewsList, type NewsItemDTO } from "@/components/NewsList";
import { Badge, buttonClass, Callout, Change, inputClass, StatusBadge } from "@/components/ui";
import { apiFetch } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { securityHref, type QuoteDTO } from "@/lib/dto";
import { fmtINR, fmtPrice } from "@/lib/format";

type WidgetType = "indices" | "movers" | "watchlist" | "chart" | "news" | "economy" | "portfolio" | "heatmap" | "notes";
interface Widget {
  id: string;
  type: WidgetType;
  title?: string;
  size: "sm" | "md" | "lg";
  config: Record<string, string | number | boolean>;
}
interface Layout {
  widgets: Widget[];
}
interface Saved {
  id: number;
  name: string;
  layout: Layout;
  isDefault: boolean;
}

export interface WorkspaceData {
  indices: QuoteDTO[];
  gainers: QuoteDTO[];
  losers: QuoteDTO[];
  watchlists: { id: number; name: string; items: QuoteDTO[] }[];
  news: NewsItemDTO[];
  economy: { id: string; name: string; value: number | null; previous: number | null; period: string | null; sourceId: string }[];
  portfolios: { id: number; name: string; marketValue: number | null; unrealized: number | null; costBasis: number; positions: number }[];
  heat: HeatCell[];
  notes: { id: number; title: string; updatedAt: string; symbol: string | null }[];
  defaultChart: { id: number; symbol: string } | null;
}

const WIDGET_META: Record<WidgetType, { label: string; defaultSize: Widget["size"] }> = {
  indices: { label: "Market summary", defaultSize: "lg" },
  movers: { label: "Top movers", defaultSize: "md" },
  watchlist: { label: "Watchlist", defaultSize: "md" },
  chart: { label: "Chart", defaultSize: "md" },
  news: { label: "News", defaultSize: "md" },
  economy: { label: "Economic indicators", defaultSize: "sm" },
  portfolio: { label: "Portfolio summary", defaultSize: "sm" },
  heatmap: { label: "Sector heatmap", defaultSize: "lg" },
  notes: { label: "Recent notes", defaultSize: "sm" },
};

const SIZE_CLASS = { sm: "xl:col-span-1", md: "md:col-span-2 xl:col-span-2", lg: "md:col-span-2 xl:col-span-3" };

const MiniQuotes = ({ rows }: { rows: QuoteDTO[] }) =>
  rows.length ? (
    <table className="data-table">
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <Link href={securityHref(r.exchange, r.symbol)} className="num font-semibold text-accent-strong hover:underline">
                {r.symbol}
              </Link>
            </td>
            <td className="r num">{fmtPrice(r.price)}</td>
            <td className="r num">
              <Change pct={r.changePct} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <p className="px-3 py-6 text-center text-[12px] text-muted">No securities.</p>
  );

function WidgetBody({ w, data }: { w: Widget; data: WorkspaceData }) {
  switch (w.type) {
    case "indices":
      return (
        <div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3 xl:grid-cols-6">
          {data.indices.map((i) => (
            <Link key={i.id} href={securityHref(i.exchange, i.symbol)} className="rounded border border-line bg-panel-2 px-2.5 py-2 hover:border-line-strong">
              <div className="truncate text-[11px] text-dim">{i.name.replace(" (demo series)", "")}</div>
              <div className="num text-[14px]">{fmtPrice(i.price)}</div>
              <Change pct={i.changePct} className="text-[11px]" />
            </Link>
          ))}
        </div>
      );
    case "movers":
      return (
        <div className="grid grid-cols-2 divide-x divide-line">
          <div>
            <div className="px-3 pt-2 text-[10.5px] uppercase tracking-[0.06em] text-up">Gainers</div>
            <MiniQuotes rows={data.gainers} />
          </div>
          <div>
            <div className="px-3 pt-2 text-[10.5px] uppercase tracking-[0.06em] text-down">Losers</div>
            <MiniQuotes rows={data.losers} />
          </div>
        </div>
      );
    case "watchlist": {
      const wl = data.watchlists.find((x) => x.id === Number(w.config.watchlistId)) ?? data.watchlists[0];
      return wl ? <MiniQuotes rows={wl.items} /> : <p className="p-3 text-[12px] text-muted">No watchlists.</p>;
    }
    case "chart": {
      const id = Number(w.config.instrumentId) || data.defaultChart?.id;
      return id ? (
        <div className="p-2">
          <InstrumentChart key={id} instrumentId={id} label={String(w.config.symbol ?? data.defaultChart?.symbol ?? "")} controls="compact" defaultType="area" height={220} />
        </div>
      ) : (
        <p className="p-3 text-[12px] text-muted">Choose a security in edit mode.</p>
      );
    }
    case "news":
      return <NewsList items={data.news} compact />;
    case "economy":
      return (
        <ul className="divide-y divide-line">
          {data.economy.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[12px]">
              <span className="truncate text-dim" title={e.name}>
                {e.name}
              </span>
              <span className="num shrink-0">
                {e.value?.toFixed(2) ?? "—"} <Change value={e.value != null && e.previous != null ? e.value - e.previous : null} className="text-[10.5px]" />
              </span>
            </li>
          ))}
        </ul>
      );
    case "portfolio": {
      const p = data.portfolios.find((x) => x.id === Number(w.config.portfolioId)) ?? data.portfolios[0];
      return p ? (
        <dl className="grid grid-cols-2 gap-2 p-3 text-[12px]">
          <dt className="text-muted">Portfolio</dt>
          <dd className="text-right text-fg">{p.name}</dd>
          <dt className="text-muted">Market value</dt>
          <dd className="num text-right">{p.marketValue != null ? fmtINR(p.marketValue, 0) : "prices missing"}</dd>
          <dt className="text-muted">Cost basis</dt>
          <dd className="num text-right">{fmtINR(p.costBasis, 0)}</dd>
          <dt className="text-muted">Unrealised</dt>
          <dd className="text-right">
            <Change value={p.unrealized} />
          </dd>
          <dt className="text-muted">Open positions</dt>
          <dd className="num text-right">{p.positions}</dd>
        </dl>
      ) : (
        <p className="p-3 text-[12px] text-muted">No portfolios.</p>
      );
    }
    case "heatmap":
      return (
        <div className="p-2">
          <MarketHeatmap cells={data.heat} height={320} />
        </div>
      );
    case "notes":
      return data.notes.length ? (
        <ul className="divide-y divide-line">
          {data.notes.map((n) => (
            <li key={n.id} className="px-3 py-1.5">
              <Link href={`/notes?id=${n.id}`} className="text-[12.5px] text-fg hover:text-accent-strong">
                {n.title}
              </Link>
              {n.symbol ? <span className="num ml-1.5 text-[10.5px] text-accent">{n.symbol}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-3 text-[12px] text-muted">No notes yet.</p>
      );
  }
}

function SortableWidget({
  w,
  data,
  editing,
  onChange,
  onRemove,
}: {
  w: Widget;
  data: WorkspaceData;
  editing: boolean;
  onChange: (w: Widget) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id, disabled: !editing });
  const title =
    w.title ||
    (w.type === "watchlist"
      ? `Watchlist — ${(data.watchlists.find((x) => x.id === Number(w.config.watchlistId)) ?? data.watchlists[0])?.name ?? ""}`
      : w.type === "chart"
        ? `Chart — ${w.config.symbol ?? data.defaultChart?.symbol ?? ""}`
        : WIDGET_META[w.type].label);
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex min-w-0 flex-col rounded-panel border bg-panel", SIZE_CLASS[w.size], isDragging ? "z-10 border-accent shadow-2xl" : "border-line", editing && "ring-1 ring-line-strong")}
      aria-label={title}
    >
      <div className="flex min-h-9 items-center gap-2 border-b border-line px-2 py-1">
        {editing ? (
          <button type="button" className="cursor-grab rounded p-1 text-faint hover:text-fg active:cursor-grabbing" aria-label={`Move ${title}. Press space, then arrow keys.`} {...attributes} {...listeners}>
            <GripVertical className="size-3.5" />
          </button>
        ) : null}
        <h2 className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">{title}</h2>
        {editing ? (
          <>
            <select value={w.size} onChange={(e) => onChange({ ...w, size: e.target.value as Widget["size"] })} aria-label="Widget size" className="h-6 rounded border border-line bg-bg px-1 text-[11px]">
              <option value="sm">Small</option>
              <option value="md">Medium</option>
              <option value="lg">Wide</option>
            </select>
            <button type="button" onClick={onRemove} className="rounded p-1 text-faint hover:text-down" aria-label={`Remove ${title}`}>
              <X className="size-3.5" />
            </button>
          </>
        ) : null}
      </div>
      {editing && (w.type === "watchlist" || w.type === "chart" || w.type === "portfolio") ? (
        <div className="border-b border-line bg-panel-2 p-2">
          {w.type === "watchlist" ? (
            <select value={String(w.config.watchlistId ?? "")} onChange={(e) => onChange({ ...w, config: { ...w.config, watchlistId: Number(e.target.value) } })} aria-label="Watchlist" className="h-7 w-full rounded border border-line-strong bg-bg px-2 text-[12px]">
              {data.watchlists.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          ) : w.type === "portfolio" ? (
            <select value={String(w.config.portfolioId ?? "")} onChange={(e) => onChange({ ...w, config: { ...w.config, portfolioId: Number(e.target.value) } })} aria-label="Portfolio" className="h-7 w-full rounded border border-line-strong bg-bg px-2 text-[12px]">
              {data.portfolios.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          ) : (
            <InstrumentPicker value={null} onChange={(v) => v && onChange({ ...w, config: { ...w.config, instrumentId: v.id, symbol: v.symbol } })} placeholder="Change chart security…" />
          )}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <WidgetBody w={w} data={data} />
      </div>
    </section>
  );
}

export function WorkspaceClient({ data, saved: initialSaved, defaultLayout, statusTone }: { data: WorkspaceData; saved: Saved[]; defaultLayout: Layout; statusTone: string }) {
  const [saved, setSaved] = useState<Saved[]>(initialSaved);
  const start = initialSaved.find((s) => s.isDefault) ?? initialSaved[0] ?? null;
  const [currentId, setCurrentId] = useState<number | null>(start?.id ?? null);
  const [name, setName] = useState(start?.name ?? "My workspace");
  const [widgets, setWidgets] = useState<Widget[]>((start?.layout ?? defaultLayout).widgets);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = useMemo(() => widgets.map((w) => w.id), [widgets]);

  const mutate = (fn: (ws: Widget[]) => Widget[]) => {
    setWidgets(fn);
    setDirty(true);
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    mutate((ws) => arrayMove(ws, ws.findIndex((w) => w.id === e.active.id), ws.findIndex((w) => w.id === e.over!.id)));
  };

  const load = (s: Saved | null) => {
    setCurrentId(s?.id ?? null);
    setName(s?.name ?? "My workspace");
    setWidgets((s?.layout ?? defaultLayout).widgets);
    setDirty(false);
    setMsg(null);
  };

  async function save(asNew = false, makeDefault?: boolean) {
    setMsg(null);
    try {
      const body = { name, layout: { widgets }, isDefault: makeDefault ?? (asNew ? saved.length === 0 : saved.find((s) => s.id === currentId)?.isDefault ?? false) };
      const { workspace } = currentId && !asNew ? await apiFetch<{ workspace: Saved }>(`/api/workspaces/${currentId}`, { method: "PATCH", body }) : await apiFetch<{ workspace: Saved }>("/api/workspaces", { body });
      setSaved((xs) => {
        const rest = xs.filter((x) => x.id !== workspace.id).map((x) => (workspace.isDefault ? { ...x, isDefault: false } : x));
        return [...rest, workspace].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
      });
      setCurrentId(workspace.id);
      setDirty(false);
      setMsg({ ok: true, text: `Saved “${workspace.name}”${workspace.isDefault ? " (default)" : ""}` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }

  async function remove() {
    if (!currentId || !confirm(`Delete workspace “${name}”?`)) return;
    try {
      await apiFetch(`/api/workspaces/${currentId}`, { method: "DELETE" });
      const rest = saved.filter((s) => s.id !== currentId);
      setSaved(rest);
      load(rest[0] ?? null);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }

  const add = (type: WidgetType) =>
    mutate((ws) => [
      ...ws,
      {
        id: `w${Date.now().toString(36)}`,
        type,
        size: WIDGET_META[type].defaultSize,
        config: type === "chart" && data.defaultChart ? { instrumentId: data.defaultChart.id, symbol: data.defaultChart.symbol } : type === "watchlist" && data.watchlists[0] ? { watchlistId: data.watchlists[0].id } : {},
      },
    ]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-panel border border-line bg-panel px-3 py-2">
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          Layout
          <select
            value={currentId ?? ""}
            onChange={(e) => {
              if (dirty && !confirm("Discard unsaved changes?")) return;
              load(saved.find((s) => s.id === Number(e.target.value)) ?? null);
            }}
            className="h-7 rounded border border-line-strong bg-bg px-2 text-[12.5px] text-fg"
          >
            {saved.length === 0 ? <option value="">Default layout (unsaved)</option> : null}
            {saved.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.isDefault ? " ★" : ""}
              </option>
            ))}
          </select>
        </label>
        {statusTone === "demo" ? <StatusBadge status="demo" /> : null}
        {dirty ? <Badge tone="stale">Unsaved changes</Badge> : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className={buttonClass(editing ? "primary" : "default", "sm")} onClick={() => setEditing((x) => !x)} aria-pressed={editing}>
            <Pencil className="size-3.5" /> {editing ? "Done editing" : "Edit layout"}
          </button>
          <button
            type="button"
            className={buttonClass("ghost", "sm")}
            onClick={() => {
              setWidgets(defaultLayout.widgets);
              setDirty(true);
            }}
          >
            <RotateCcw className="size-3.5" /> Reset to default
          </button>
        </div>
      </div>

      {editing ? (
        <div className="flex flex-col gap-2 rounded-panel border border-accent/40 bg-accent-soft/20 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.05em] text-muted">Add widget</span>
            {(Object.keys(WIDGET_META) as WidgetType[]).map((t) => (
              <button key={t} type="button" onClick={() => add(t)} className={buttonClass("default", "sm")}>
                <Plus className="size-3" /> {WIDGET_META[t].label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
            <input value={name} onChange={(e) => (setName(e.target.value), setDirty(true))} aria-label="Workspace name" maxLength={80} className={cn(inputClass, "h-7 w-56")} />
            <button type="button" onClick={() => save(false)} className={buttonClass("primary", "sm")} disabled={!name.trim()}>
              <Save className="size-3.5" /> Save
            </button>
            <button type="button" onClick={() => save(true)} className={buttonClass("default", "sm")} disabled={!name.trim()}>
              Save as new
            </button>
            <button type="button" onClick={() => save(false, true)} className={buttonClass("default", "sm")} disabled={!name.trim()}>
              <Star className="size-3.5" /> Save as default
            </button>
            {currentId ? (
              <button type="button" onClick={remove} className={buttonClass("danger", "sm")}>
                <Trash2 className="size-3.5" /> Delete
              </button>
            ) : null}
            <span className="text-[11px] text-faint">Drag the grip handle, or focus it and press Space then arrow keys, to reorder.</span>
          </div>
        </div>
      ) : null}
      {msg ? <Callout tone={msg.ok ? "info" : "error"}>{msg.text}</Callout> : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {widgets.map((w) => (
              <SortableWidget key={w.id} w={w} data={data} editing={editing} onChange={(nw) => mutate((ws) => ws.map((x) => (x.id === w.id ? nw : x)))} onRemove={() => mutate((ws) => ws.filter((x) => x.id !== w.id))} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {widgets.length === 0 ? <p className="rounded-panel border border-dashed border-line py-12 text-center text-[12.5px] text-muted">This workspace is empty. Click “Edit layout” to add widgets.</p> : null}
    </div>
  );
}
