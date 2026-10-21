import { and, arrayContains, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import * as s from "@/lib/db/schema";

/** Use real feed items when any exist; otherwise fall back to the labelled sample set. */
export async function newsSourceIds(db: Database): Promise<string[]> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(s.newsArticles).where(eq(s.newsArticles.sourceId, "rss"));
  return Number(row?.n ?? 0) > 0 ? ["rss"] : ["demo"];
}

export interface NewsQuery {
  q?: string;
  category?: string;
  ticker?: string;
  savedBy?: string;
  limit?: number;
  offset?: number;
}

export async function listNews(db: Database, query: NewsQuery = {}) {
  const sources = await newsSourceIds(db);
  const conds = [inArray(s.newsArticles.sourceId, sources)];
  if (query.q?.trim()) {
    const like = `%${query.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conds.push(or(ilike(s.newsArticles.title, like), ilike(s.newsArticles.summary, like))!);
  }
  if (query.category) conds.push(arrayContains(s.newsArticles.categories, [query.category]));
  if (query.ticker) conds.push(arrayContains(s.newsArticles.tickers, [query.ticker]));
  const base = db
    .select({ article: s.newsArticles, savedAt: s.savedArticles.savedAt })
    .from(s.newsArticles)
    .leftJoin(s.savedArticles, and(eq(s.savedArticles.articleId, s.newsArticles.id), eq(s.savedArticles.userId, query.savedBy ?? "00000000-0000-0000-0000-000000000000")));
  const rows = await base
    .where(and(...conds))
    .orderBy(desc(s.newsArticles.publishedAt))
    .limit(Math.min(query.limit ?? 50, 200))
    .offset(query.offset ?? 0);
  return rows.map((r) => ({ ...r.article, saved: r.savedAt != null }));
}

export async function listSavedNews(db: Database, userId: string) {
  const rows = await db
    .select({ article: s.newsArticles, savedAt: s.savedArticles.savedAt })
    .from(s.savedArticles)
    .innerJoin(s.newsArticles, eq(s.newsArticles.id, s.savedArticles.articleId))
    .where(eq(s.savedArticles.userId, userId))
    .orderBy(desc(s.savedArticles.savedAt));
  return rows.map((r) => ({ ...r.article, saved: true }));
}

export async function newsCategories(db: Database) {
  const sources = await newsSourceIds(db);
  const rows = await db
    .select({ c: sql<string>`unnest(${s.newsArticles.categories})` })
    .from(s.newsArticles)
    .where(inArray(s.newsArticles.sourceId, sources));
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.c, (counts.get(r.c) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

export async function listEconomicSeries(db: Database, opts: { category?: string; country?: string } = {}) {
  const conds = [];
  if (opts.category) conds.push(eq(s.economicSeries.category, opts.category));
  if (opts.country) conds.push(eq(s.economicSeries.country, opts.country));
  return db.select().from(s.economicSeries).where(conds.length ? and(...conds) : undefined).orderBy(asc(s.economicSeries.country), asc(s.economicSeries.category), asc(s.economicSeries.id));
}

export async function getObservations(db: Database, seriesIds: string[], from?: string) {
  if (seriesIds.length === 0) return new Map<string, { periodDate: string; value: number | null }[]>();
  const rows = await db
    .select()
    .from(s.economicObservations)
    .where(and(inArray(s.economicObservations.seriesId, seriesIds), from ? sql`${s.economicObservations.periodDate} >= ${from}` : undefined))
    .orderBy(asc(s.economicObservations.periodDate));
  const out = new Map<string, { periodDate: string; value: number | null }[]>();
  for (const r of rows) {
    if (!out.has(r.seriesId)) out.set(r.seriesId, []);
    out.get(r.seriesId)!.push({ periodDate: r.periodDate, value: r.value });
  }
  return out;
}

/** Latest and previous non-null observation for each series. */
export async function latestObservations(db: Database, seriesIds: string[]) {
  const all = await getObservations(db, seriesIds);
  const out = new Map<string, { latest: { periodDate: string; value: number } | null; previous: { periodDate: string; value: number } | null }>();
  for (const id of seriesIds) {
    const obs = (all.get(id) ?? []).filter((o): o is { periodDate: string; value: number } => o.value != null);
    out.set(id, { latest: obs[obs.length - 1] ?? null, previous: obs[obs.length - 2] ?? null });
  }
  return out;
}
