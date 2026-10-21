import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, Inbox, Info } from "lucide-react";
import { cn } from "@/lib/cn";
import { changeClass, fmtPct, fmtSigned } from "@/lib/format";
import { STATUS_DESCRIPTION, STATUS_LABEL } from "@/lib/market/freshness";
import type { DisplayStatus } from "@/lib/market/types";

export function PageHeader({
  title,
  subtitle,
  actions,
  status,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-[17px] font-semibold tracking-tight text-fg">{title}</h1>
          {status}
        </div>
        {subtitle ? <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
  footer,
  id,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  footer?: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className={cn("flex min-w-0 flex-col rounded-panel border border-line bg-panel", className)}>
      {title || actions ? (
        <div className="flex min-h-9 items-center justify-between gap-2 border-b border-line px-3 py-1.5">
          <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">{title}</h2>
          {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("min-w-0 flex-1", bodyClassName ?? "p-3")}>{children}</div>
      {footer ? <div className="border-t border-line px-3 py-1.5 text-[11px] text-muted">{footer}</div> : null}
    </section>
  );
}

const BADGE_TONES = {
  neutral: "border-line-strong text-dim bg-panel-2",
  accent: "border-accent/40 text-accent-strong bg-accent-soft",
  up: "border-up/40 text-up bg-up-soft",
  down: "border-down/40 text-down bg-down-soft",
  demo: "border-demo/50 text-demo bg-demo-soft",
  stale: "border-stale/50 text-stale bg-stale/10",
  info: "border-info/40 text-info bg-info/10",
} as const;

export function Badge({
  tone = "neutral",
  children,
  className,
  title,
}: {
  tone?: keyof typeof BADGE_TONES;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-[18px] items-center gap-1 rounded-[3px] border px-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] whitespace-nowrap",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONE: Record<DisplayStatus, keyof typeof BADGE_TONES> = {
  demo: "demo",
  live: "up",
  delayed: "info",
  eod: "neutral",
  stale: "stale",
  unavailable: "down",
};

/** Data-status label. Every price shown in the app is paired with one of these. */
export function StatusBadge({ status, asOf, className }: { status: DisplayStatus; asOf?: string; className?: string }) {
  return (
    <Badge tone={STATUS_TONE[status]} className={className} title={`${STATUS_DESCRIPTION[status]}${asOf ? ` As of ${asOf}.` : ""}`}>
      {status === "live" ? <span className="pulse-dot size-1.5 rounded-full bg-up" aria-hidden /> : null}
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function Change({ value, pct, className }: { value?: number | null; pct?: number | null; className?: string }) {
  const ref = pct ?? value;
  return (
    <span className={cn("num", changeClass(ref), className)}>
      {value !== undefined ? fmtSigned(value) : null}
      {value !== undefined && pct !== undefined ? " " : null}
      {pct !== undefined ? (value !== undefined ? `(${fmtPct(pct)})` : fmtPct(pct)) : null}
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
  className,
  hint,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <div className={cn("min-w-0", className)} title={hint}>
      <div className="truncate text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted">{label}</div>
      <div className="num mt-0.5 truncate text-[15px] font-medium text-fg">{value}</div>
      {sub ? <div className="mt-0.5 truncate text-[11px]">{sub}</div> : null}
    </div>
  );
}

export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <div className="text-faint">{icon ?? <Inbox className="size-6" aria-hidden />}</div>
      <div className="text-[13px] font-medium text-dim">{title}</div>
      {children ? <div className="max-w-md text-[12px] text-muted">{children}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warn" | "demo" | "error";
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const styles = {
    info: "border-info/30 bg-info/5 text-dim",
    warn: "border-stale/40 bg-stale/5 text-dim",
    demo: "border-demo/40 bg-demo-soft text-dim demo-stripe",
    error: "border-down/40 bg-down-soft text-dim",
  }[tone];
  const Icon = tone === "info" ? Info : AlertTriangle;
  const iconColor = { info: "text-info", warn: "text-stale", demo: "text-demo", error: "text-down" }[tone];
  return (
    <div role={tone === "error" ? "alert" : "note"} className={cn("flex gap-2.5 rounded-panel border px-3 py-2 text-[12px]", styles, className)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", iconColor)} aria-hidden />
      <div className="min-w-0">
        {title ? <div className="font-semibold text-fg">{title}</div> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function DataUnavailable({ what = "Data", text }: { what?: string; text?: string }) {
  return (
    <span className="text-[12px] italic text-faint" title="Not provided by the active data source">
      {text ?? `${what} unavailable`}
    </span>
  );
}

const BUTTON_VARIANTS = {
  primary: "bg-accent text-bg hover:bg-accent-strong border-transparent font-semibold",
  default: "bg-panel-2 text-fg border-line-strong hover:bg-raised",
  ghost: "bg-transparent text-dim border-transparent hover:bg-raised hover:text-fg",
  danger: "bg-transparent text-down border-down/40 hover:bg-down-soft",
} as const;

export function buttonClass(variant: keyof typeof BUTTON_VARIANTS = "default", size: "sm" | "md" = "md") {
  return cn(
    "inline-flex items-center justify-center gap-1.5 rounded-[4px] border whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "h-7 px-2 text-[12px]" : "h-8 px-3 text-[12.5px]",
    BUTTON_VARIANTS[variant],
  );
}

export function LinkButton({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof BUTTON_VARIANTS; size?: "sm" | "md" }) {
  return <Link {...props} className={cn(buttonClass(variant, size), className)} />;
}

export function KeyValue({ rows, className }: { rows: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-[12.5px]", className)}>
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="truncate text-muted">{k}</dt>
          <dd className="num text-right text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export const inputClass =
  "h-8 w-full rounded-[4px] border border-line-strong bg-bg px-2.5 text-[12.5px] text-fg placeholder:text-faint focus:border-accent focus:outline-none disabled:opacity-50";

export function Field({ label, children, hint, error, htmlFor }: { label: string; children: ReactNode; hint?: ReactNode; error?: string | null; htmlFor?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
        {label}
      </label>
      {children}
      {error ? <p className="text-[11px] text-down">{error}</p> : hint ? <p className="text-[11px] text-faint">{hint}</p> : null}
    </div>
  );
}
