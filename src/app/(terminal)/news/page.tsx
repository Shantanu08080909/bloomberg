import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Search } from "lucide-react";
import { Badge, buttonClass, Callout, EmptyState, inputClass, PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth/server";
import { cn } from "@/lib/cn";
import { formatIST } from "@/lib/dates";
import { db } from "@/lib/server/db";
import { listNews, listSavedNews, newsCategories, newsSourceIds } from "@/lib/services/content";
import { SaveButton } from "./SaveButton";

export const metadata: Metadata = { title: "Financial News" };

const PAGE = 20;

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; ticker?: string; saved?: string; page?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const database = await db();
  const page = Math.max(1, Number(sp.page) || 1);
  const savedOnly = sp.saved === "1";
  const q = sp.q?.slice(0, 100);
  const category = sp.category?.slice(0, 60);
  const ticker = sp.ticker?.slice(0, 40).toUpperCase();
  const [items, categories, sources] = await Promise.all([
    savedOnly ? listSavedNews(database, user.id) : listNews(database, { q, category, ticker, savedBy: user.id, limit: PAGE + 1, offset: (page - 1) * PAGE }),
    newsCategories(database),
    newsSourceIds(database),
  ]);
  const hasMore = !savedOnly && items.length > PAGE;
  const visible = savedOnly ? items : items.slice(0, PAGE);
  const sample = sources.includes("demo");
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q, category, ticker, saved: savedOnly ? "1" : undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/news${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Financial News" subtitle={sample ? "Sample headlines (no news feed configured)" : "Headlines from your configured RSS/Atom feeds"} status={sample ? <Badge tone="demo">Sample news</Badge> : <Badge tone="up">Feeds</Badge>} />
      {sample ? (
        <Callout tone="demo" title="These are sample headlines, not current news">
          No news provider is configured, so the terminal shows a labelled sample set about fictional companies. Add RSS/Atom feeds you are permitted to use with{" "}
          <code>NEWS_RSS_FEEDS</code> and refresh them on the <Link href="/providers" className="underline">Data Provider Status</Link> page.
        </Callout>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-3">
          <form action="/news" className="flex gap-1.5" role="search">
            <label className="sr-only" htmlFor="news-q">
              Search news
            </label>
            <input id="news-q" name="q" defaultValue={q} placeholder="Search headlines…" className={cn(inputClass, "h-7")} />
            {ticker ? <input type="hidden" name="ticker" value={ticker} /> : null}
            <button type="submit" className={buttonClass("default", "sm")} aria-label="Search">
              <Search className="size-3.5" />
            </button>
          </form>
          <Panel title="Filters" bodyClassName="p-2">
            <ul className="flex flex-col gap-0.5 text-[12.5px]">
              <li>
                <Link href="/news" className={cn("block rounded px-2 py-1 hover:bg-raised", !category && !savedOnly && !ticker ? "bg-raised text-fg" : "text-dim")}>
                  All articles
                </Link>
              </li>
              <li>
                <Link href="/news?saved=1" className={cn("block rounded px-2 py-1 hover:bg-raised", savedOnly ? "bg-raised text-fg" : "text-dim")}>
                  Saved articles
                </Link>
              </li>
            </ul>
            <div className="mt-2 border-t border-line pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Topics</div>
            <ul className="mt-1 flex flex-col gap-0.5 text-[12.5px]">
              {categories.map((c) => (
                <li key={c.name}>
                  <Link href={link({ category: c.name, page: undefined, saved: undefined })} className={cn("flex justify-between rounded px-2 py-1 hover:bg-raised", category === c.name ? "bg-raised text-fg" : "text-dim")}>
                    <span className="truncate">{c.name}</span>
                    <span className="num text-[11px] text-faint">{c.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>

        <Panel
          bodyClassName="p-0"
          title={savedOnly ? "Saved articles" : [category, ticker && `Ticker ${ticker}`, q && `“${q}”`].filter(Boolean).join(" · ") || "Latest"}
          actions={
            ticker || category || q ? (
              <Link href="/news" className="text-[11px] text-accent hover:underline">
                Clear filters
              </Link>
            ) : null
          }
        >
          {visible.length === 0 ? (
            <EmptyState title={savedOnly ? "No saved articles" : "No articles match"}>{savedOnly ? "Use Save on any article to keep it here." : "Try a different search or topic."}</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {visible.map((n) => (
                <li key={n.id} className="flex gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    {n.url ? (
                      <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" className="text-[13px] font-medium text-fg hover:text-accent-strong">
                        {n.title} <ExternalLink className="mb-0.5 inline size-3 text-faint" aria-label="(opens original article)" />
                      </a>
                    ) : (
                      <span className="text-[13px] font-medium text-fg">{n.title}</span>
                    )}
                    {n.summary ? <p className="mt-0.5 text-[12px] text-muted">{n.summary}</p> : null}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-faint">
                      {n.isSample ? <Badge tone="demo">Sample</Badge> : null}
                      <span className="text-dim">{n.publisher}</span>
                      <span>·</span>
                      <time dateTime={n.publishedAt.toISOString()}>{formatIST(n.publishedAt)} IST</time>
                      {n.categories.map((c) => (
                        <Link key={c} href={link({ category: c, page: undefined, saved: undefined })} className="hover:text-fg">
                          #{c}
                        </Link>
                      ))}
                      {n.tickers.map((t) => (
                        <Link key={t} href={link({ ticker: t, page: undefined, saved: undefined })} className="num text-accent hover:underline">
                          {t}
                        </Link>
                      ))}
                    </div>
                  </div>
                  <SaveButton articleId={n.id} saved={n.saved} />
                </li>
              ))}
            </ul>
          )}
          {page > 1 || hasMore ? (
            <div className="flex justify-between border-t border-line px-3 py-2 text-[12px]">
              {page > 1 ? (
                <Link href={link({ page: String(page - 1) })} className="text-accent hover:underline">
                  ← Newer
                </Link>
              ) : (
                <span />
              )}
              {hasMore ? (
                <Link href={link({ page: String(page + 1) })} className="text-accent hover:underline">
                  Older →
                </Link>
              ) : null}
            </div>
          ) : null}
          <p className="border-t border-line px-3 py-1.5 text-[10.5px] text-faint">
            Only headlines, links and the short descriptions supplied by feeds are stored. Full articles are never copied; follow the link to read the original at its publisher.
          </p>
        </Panel>
      </div>
    </div>
  );
}
