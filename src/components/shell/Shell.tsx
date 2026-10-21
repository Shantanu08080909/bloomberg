"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Bell, ChevronDown, LogOut, Menu, Search, Settings, X } from "lucide-react";
import { NAV } from "@/lib/nav";
import { NAV_ICONS } from "@/components/icons";
import { cn } from "@/lib/cn";
import { marketSessionAt } from "@/lib/dates";
import { apiFetch } from "@/lib/client/api";
import { CommandPalette } from "./CommandPalette";

export interface ShellStatus {
  sourceName: string;
  label: string;
  tone: "demo" | "live" | "delayed" | "eod" | "stale" | "unavailable";
  lastAsOf: string | null;
  mixed: boolean;
}

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function IstClock() {
  const now = useClock();
  const session = now ? marketSessionAt(now) : null;
  const time = now
    ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now)
    : "--:--:--";
  const date = now ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "2-digit", month: "short" }).format(now) : "";
  const sessionLabel = { open: "Session open", "pre-open": "Pre-open", closed: "Closed" } as const;
  return (
    <div className="hidden items-center gap-3 lg:flex" title="NSE/BSE regular session by IST clock. Exchange holidays are not checked.">
      <div className="text-right leading-tight">
        <div className="num text-[12.5px] text-fg">{time} <span className="text-[10px] text-muted">IST</span></div>
        <div className="text-[10px] text-muted">{date}</div>
      </div>
      {session ? (
        <span className={cn("flex items-center gap-1.5 text-[11px]", session === "open" ? "text-up" : session === "pre-open" ? "text-demo" : "text-muted")}>
          <span className={cn("size-1.5 rounded-full", session === "open" ? "bg-up pulse-dot" : session === "pre-open" ? "bg-demo" : "bg-faint")} aria-hidden />
          {sessionLabel[session]}
        </span>
      ) : null}
    </div>
  );
}

const TONE_CLASSES: Record<ShellStatus["tone"], string> = {
  demo: "border-demo/50 bg-demo-soft text-demo",
  live: "border-up/40 bg-up-soft text-up",
  delayed: "border-info/40 bg-info/10 text-info",
  eod: "border-line-strong bg-panel-2 text-dim",
  stale: "border-stale/50 bg-stale/10 text-stale",
  unavailable: "border-down/40 bg-down-soft text-down",
};

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label="Main" className="flex h-full flex-col overflow-y-auto px-2 pb-4 pt-3">
      {NAV.map((group) => (
        <div key={group.label} className="mb-3">
          <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">{group.label}</div>
          <ul>
            {group.items.map((item) => {
              const Icon = NAV_ICONS[item.icon]!;
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex h-7 items-center gap-2 rounded px-2 text-[12.5px] transition-colors",
                      active ? "bg-raised text-fg" : "text-dim hover:bg-panel-2 hover:text-fg",
                    )}
                  >
                    <Icon className={cn("size-3.5 shrink-0", active ? "text-accent" : "text-faint group-hover:text-muted")} aria-hidden />
                    <span className="truncate">{item.label}</span>
                    {active ? <span className="ml-auto h-3.5 w-0.5 rounded bg-accent" aria-hidden /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserMenu({ displayName }: { displayName: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 items-center gap-1.5 rounded px-2 text-[12px] text-dim hover:bg-raised hover:text-fg"
      >
        <span className="grid size-6 place-items-center rounded-full bg-raised text-[11px] font-semibold text-accent-strong">
          {displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden max-w-28 truncate sm:inline">{displayName}</span>
        <ChevronDown className="size-3" aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-9 z-40 w-44 rounded-md border border-line-strong bg-panel py-1 shadow-xl">
          <Link role="menuitem" href="/settings" className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-dim hover:bg-raised hover:text-fg">
            <Settings className="size-3.5" aria-hidden /> Settings
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
              router.push("/login");
              router.refresh();
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-dim hover:bg-raised hover:text-fg"
          >
            <LogOut className="size-3.5" aria-hidden /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Shell({
  children,
  user,
  status,
  unread,
  watchlists,
  banner,
}: {
  children: ReactNode;
  user: { displayName: string };
  status: ShellStatus;
  unread: number;
  watchlists: { id: number; name: string }[];
  banner: ReactNode;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMobileNav(false), [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-1 focus:text-bg">
        Skip to content
      </a>
      {banner}
      <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-line bg-bg/95 px-3 backdrop-blur">
        <button type="button" className="rounded p-1.5 text-dim hover:bg-raised md:hidden" aria-label="Open navigation" onClick={() => setMobileNav(true)}>
          <Menu className="size-4" />
        </button>
        <Link href="/" className="flex shrink-0 items-center gap-2 pr-2 md:w-[196px]">
          <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
            <rect width="32" height="32" rx="6" fill="#1b1f23" />
            <path d="M6 22l6-7 5 4 9-11" fill="none" stroke="#4fb6b0" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="hidden text-[13px] font-semibold tracking-tight sm:inline">
            OpenFinance <span className="font-normal text-muted">Terminal</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded border border-line bg-panel px-2.5 text-left text-[12.5px] text-faint hover:border-line-strong md:max-w-md"
          aria-label="Search securities and pages"
        >
          <Search className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">Search symbol, company or page</span>
          <kbd className="ml-auto hidden rounded border border-line px-1.5 text-[10px] text-muted sm:inline">Ctrl K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/providers"
            className={cn("hidden h-7 items-center gap-1.5 rounded border px-2 text-[11px] font-semibold uppercase tracking-[0.05em] sm:flex", TONE_CLASSES[status.tone])}
            title={`${status.sourceName}${status.lastAsOf ? ` · data as of ${status.lastAsOf}` : ""}${status.mixed ? " · mixed statuses" : ""}`}
          >
            {status.label}
            {status.mixed ? <span className="font-normal normal-case">· mixed</span> : null}
          </Link>
          <IstClock />
          <Link href="/alerts#notifications" className="relative rounded p-1.5 text-dim hover:bg-raised hover:text-fg" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
            <Bell className="size-4" />
            {unread > 0 ? (
              <span className="num absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-down px-1 text-[9px] font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Link>
          <UserMenu displayName={user.displayName} />
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="sticky top-12 hidden h-[calc(100vh-3rem)] w-[212px] shrink-0 border-r border-line bg-bg md:block">
          <Sidebar />
        </aside>
        {mobileNav ? (
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileNav(false)} />
            <div className="absolute inset-y-0 left-0 w-64 border-r border-line bg-bg">
              <div className="flex h-12 items-center justify-between border-b border-line px-3">
                <span className="text-[13px] font-semibold">Navigation</span>
                <button type="button" className="rounded p-1.5 text-dim hover:bg-raised" aria-label="Close navigation" onClick={() => setMobileNav(false)}>
                  <X className="size-4" />
                </button>
              </div>
              <Sidebar onNavigate={() => setMobileNav(false)} />
            </div>
          </div>
        ) : null}
        <main id="main" className="min-w-0 flex-1 px-3 py-4 sm:px-5">
          {children}
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} watchlists={watchlists} />
    </div>
  );
}
