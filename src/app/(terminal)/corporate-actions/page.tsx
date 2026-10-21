import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, EmptyState, inputClass, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatISTDate } from "@/lib/dates";
import { securityHref } from "@/lib/dto";
import { getActiveSourceId, getShellStatus } from "@/lib/server/context";
import { db } from "@/lib/server/db";
import { getCorporateActions } from "@/lib/services/market";

export const metadata: Metadata = { title: "Corporate Actions" };

const TYPES = ["DIVIDEND", "SPLIT", "BONUS", "RIGHTS"] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function CorporateActionsPage({ searchParams }: { searchParams: Promise<{ type?: string; symbol?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const type = TYPES.find((t) => t === sp.type);
  const symbol = sp.symbol?.trim().toUpperCase().slice(0, 40) || undefined;
  const from = sp.from && DATE.test(sp.from) ? sp.from : undefined;
  const to = sp.to && DATE.test(sp.to) ? sp.to : undefined;
  const database = await db();
  const [status, rows] = await Promise.all([getShellStatus(), getCorporateActions(database, getActiveSourceId(), { type, from, to, limit: 1000 })]);
  const filtered = symbol ? rows.filter((r) => r.symbol.includes(symbol)) : rows;
  const counts = TYPES.map((t) => ({ t, n: rows.filter((r) => r.action.actionType === t).length }));

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Corporate Actions" subtitle="Dividends, splits, bonus and rights issues from the active data source." status={<StatusBadge status={status.tone} />} />
      <form action="/corporate-actions" className="flex flex-wrap items-end gap-2 rounded-panel border border-line bg-panel px-3 py-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          Type
          <select name="type" defaultValue={type ?? ""} className="h-7 rounded border border-line-strong bg-bg px-2 text-[12px] text-fg">
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          Symbol contains
          <input name="symbol" defaultValue={symbol} className={cn(inputClass, "h-7 w-36")} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          Ex-date from
          <input type="date" name="from" defaultValue={from} className={cn(inputClass, "h-7 w-40")} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          to
          <input type="date" name="to" defaultValue={to} className={cn(inputClass, "h-7 w-40")} />
        </label>
        <button type="submit" className={buttonClass("primary", "sm")}>
          Apply
        </button>
        <Link href="/corporate-actions" className={buttonClass("ghost", "sm")}>
          Reset
        </Link>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {counts.map((c) => (
            <Badge key={c.t} tone={c.t === "DIVIDEND" ? "up" : "info"}>
              {c.t} {c.n}
            </Badge>
          ))}
        </div>
      </form>
      <Panel bodyClassName="p-0 overflow-x-auto" footer="Split and bonus actions in demo data are reflected in split-adjusted historical prices. Portfolio holdings are not adjusted automatically — record a SPLIT transaction.">
        {filtered.length ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Ex-date</th>
                <th>Record date</th>
                <th>Symbol</th>
                <th>Company</th>
                <th>Type</th>
                <th className="r">Amount / ratio</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.action.id}>
                  <td className="num">{formatISTDate(r.action.exDate)}</td>
                  <td className="num text-muted">{formatISTDate(r.action.recordDate)}</td>
                  <td>
                    <Link href={securityHref(r.exchange, r.symbol)} className="num font-semibold text-accent-strong hover:underline">
                      {r.symbol}
                    </Link>
                    <span className="ml-1 text-[10px] text-faint">{r.exchange}</span>
                  </td>
                  <td className="max-w-[220px] truncate text-dim">{r.name}</td>
                  <td>
                    <Badge tone={r.action.actionType === "DIVIDEND" ? "up" : "info"}>{r.action.actionType}</Badge>
                  </td>
                  <td className="r num">
                    {r.action.actionType === "DIVIDEND" ? `₹${Number(r.action.details.amountPerShare).toFixed(2)}` : r.action.details.ratioFrom ? `${r.action.details.ratioFrom}:${r.action.details.ratioTo}` : "—"}
                  </td>
                  <td className="whitespace-normal text-[12px] text-muted">{r.action.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="No corporate actions match">Change the filters, or the active source may not provide corporate actions.</EmptyState>
        )}
      </Panel>
    </div>
  );
}
