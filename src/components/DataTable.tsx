"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/cn";

export interface Column<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  sortValue?: (row: T) => number | string | null | undefined;
  render: (row: T) => ReactNode;
  className?: string;
  title?: string;
}

/** Searchable, sortable, paginated table for client components. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  searchText,
  pageSize = 25,
  initialSort,
  empty,
  searchPlaceholder = "Filter rows…",
  toolbar,
  caption,
  maxHeight,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  searchText?: (row: T) => string;
  pageSize?: number;
  initialSort?: { key: string; dir: "asc" | "desc" };
  empty?: ReactNode;
  searchPlaceholder?: string;
  toolbar?: ReactNode;
  caption?: string;
  maxHeight?: number;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = needle && searchText ? rows.filter((r) => searchText(r).toLowerCase().includes(needle)) : rows;
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.sortValue) {
        const dir = sort.dir === "asc" ? 1 : -1;
        out = [...out].sort((a, b) => {
          const va = col.sortValue!(a);
          const vb = col.sortValue!(b);
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
          return ((va as number) - (vb as number)) * dir;
        });
      }
    }
    return out;
  }, [rows, q, sort, columns, searchText]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);

  const toggleSort = (key: string) => {
    setPage(1);
    setSort((s) => (s?.key === key ? (s.dir === "desc" ? { key, dir: "asc" } : null) : { key, dir: "desc" }));
  };

  return (
    <div className="flex min-w-0 flex-col">
      {searchText || toolbar ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          {searchText ? (
            <label className="relative flex min-w-48 flex-1 items-center sm:max-w-72">
              <span className="sr-only">{searchPlaceholder}</span>
              <Search className="pointer-events-none absolute left-2 size-3.5 text-faint" aria-hidden />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder={searchPlaceholder}
                className="h-7 w-full rounded border border-line bg-bg pl-7 pr-2 text-[12px] text-fg placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </label>
          ) : null}
          {toolbar}
          <span className="num ml-auto text-[11px] text-faint">
            {filtered.length.toLocaleString("en-IN")} row{filtered.length === 1 ? "" : "s"}
          </span>
        </div>
      ) : null}
      <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
        <table className="data-table">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((c) => {
                const sorted = sort?.key === c.key ? sort.dir : null;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn(c.align === "right" && "r", c.className)}
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    title={c.title}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={cn("inline-flex items-center gap-1 uppercase hover:text-fg", c.align === "right" && "flex-row-reverse")}
                      >
                        {c.header}
                        {sorted === "asc" ? <ArrowUp className="size-3" /> : sorted === "desc" ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={rowKey(r)}>
                {columns.map((c) => (
                  <td key={c.key} className={cn(c.align === "right" && "r num", c.className)}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 ? <div className="px-3 py-8 text-center text-[12px] text-muted">{empty ?? (q ? `No rows match “${q}”.` : "No data.")}</div> : null}
      </div>
      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2 border-t border-line px-3 py-1.5 text-[11.5px] text-muted">
          <button type="button" className="rounded p-1 hover:bg-raised disabled:opacity-30" onClick={() => setPage(current - 1)} disabled={current <= 1} aria-label="Previous page">
            <ChevronLeft className="size-3.5" />
          </button>
          <span className="num">
            Page {current} of {pages}
          </span>
          <button type="button" className="rounded p-1 hover:bg-raised disabled:opacity-30" onClick={() => setPage(current + 1)} disabled={current >= pages} aria-label="Next page">
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
