"use client";

import { useState } from "react";
import { SeriesChart } from "@/components/charts/SeriesChart";
import { cn } from "@/lib/cn";

interface S {
  id: string;
  name: string;
  country: string;
  unit: string;
  sourceId: string;
  points: { periodDate: string; value: number | null }[];
}

export function EconomyCompare({ series, initial }: { series: S[]; initial: string[] }) {
  const [sel, setSel] = useState<string[]>(initial.filter((id) => series.some((s) => s.id === id)));
  const chosen = series.filter((s) => sel.includes(s.id));
  const units = [...new Set(chosen.map((s) => s.unit))];
  return (
    <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
      <fieldset className="max-h-[320px] overflow-y-auto rounded border border-line p-2">
        <legend className="px-1 text-[11px] text-muted">Series to compare</legend>
        {series.map((s) => (
          <label key={s.id} className={cn("flex items-start gap-2 rounded px-1.5 py-1 text-[12px] hover:bg-raised", sel.includes(s.id) ? "text-fg" : "text-dim")}>
            <input
              type="checkbox"
              checked={sel.includes(s.id)}
              onChange={(e) => setSel((x) => (e.target.checked ? [...x, s.id].slice(-6) : x.filter((y) => y !== s.id)))}
              className="mt-0.5 accent-[var(--color-accent)]"
            />
            <span>
              {s.name} <span className="text-[10.5px] text-faint">· {s.country}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div>
        <SeriesChart series={chosen.map((s) => ({ name: s.name, points: s.points }))} height={300} ariaLabel="Economic indicator comparison" unit={units.length === 1 ? units[0] : undefined} />
        {units.length > 1 ? <p className="mt-1 text-[11px] text-stale">Selected series use different units ({units.join(", ")}); compare shapes, not levels.</p> : null}
        <p className="mt-1 text-[10.5px] text-faint">Up to six series. Drag the slider or scroll to zoom.</p>
      </div>
    </div>
  );
}
