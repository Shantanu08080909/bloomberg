/**
 * User-owned records. Every function takes the authenticated user's id and
 * scopes every read and write to it, so a record id supplied by a browser can
 * never reach another user's data (no insecure direct object references).
 */
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { ScreenConfigSchema } from "@/lib/finance/screener";

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

const name = z.string().trim().min(1, "Name is required").max(80);

/* ----------------------------- Watchlists ---------------------------- */

export async function listWatchlists(db: Database, userId: string) {
  const lists = await db.select().from(s.watchlists).where(eq(s.watchlists.userId, userId)).orderBy(asc(s.watchlists.createdAt), asc(s.watchlists.id));
  if (lists.length === 0) return [];
  const counts = await db
    .select({ watchlistId: s.watchlistItems.watchlistId, n: sql<number>`count(*)::int` })
    .from(s.watchlistItems)
    .where(inArray(s.watchlistItems.watchlistId, lists.map((l) => l.id)))
    .groupBy(s.watchlistItems.watchlistId);
  const map = new Map(counts.map((c) => [c.watchlistId, Number(c.n)]));
  return lists.map((l) => ({ ...l, itemCount: map.get(l.id) ?? 0 }));
}

export async function getOwnedWatchlist(db: Database, userId: string, id: number) {
  const [w] = await db.select().from(s.watchlists).where(and(eq(s.watchlists.id, id), eq(s.watchlists.userId, userId)));
  if (!w) throw new NotFoundError("Watchlist");
  return w;
}

export async function createWatchlist(db: Database, userId: string, input: { name: string }) {
  const [w] = await db.insert(s.watchlists).values({ userId, name: name.parse(input.name) }).returning();
  return w!;
}

export async function renameWatchlist(db: Database, userId: string, id: number, input: { name: string }) {
  await getOwnedWatchlist(db, userId, id);
  const [w] = await db.update(s.watchlists).set({ name: name.parse(input.name) }).where(and(eq(s.watchlists.id, id), eq(s.watchlists.userId, userId))).returning();
  return w!;
}

export async function deleteWatchlist(db: Database, userId: string, id: number) {
  await getOwnedWatchlist(db, userId, id);
  await db.delete(s.watchlists).where(and(eq(s.watchlists.id, id), eq(s.watchlists.userId, userId)));
}

export async function addToWatchlist(db: Database, userId: string, watchlistId: number, instrumentId: number) {
  await getOwnedWatchlist(db, userId, watchlistId);
  const [inst] = await db.select({ id: s.instruments.id }).from(s.instruments).where(eq(s.instruments.id, instrumentId));
  if (!inst) throw new NotFoundError("Instrument");
  await db.insert(s.watchlistItems).values({ watchlistId, instrumentId }).onConflictDoNothing();
}

export async function removeFromWatchlist(db: Database, userId: string, watchlistId: number, instrumentId: number) {
  await getOwnedWatchlist(db, userId, watchlistId);
  await db.delete(s.watchlistItems).where(and(eq(s.watchlistItems.watchlistId, watchlistId), eq(s.watchlistItems.instrumentId, instrumentId)));
}

export async function watchlistInstrumentIds(db: Database, userId: string, watchlistId: number) {
  await getOwnedWatchlist(db, userId, watchlistId);
  const rows = await db
    .select({ id: s.watchlistItems.instrumentId })
    .from(s.watchlistItems)
    .where(eq(s.watchlistItems.watchlistId, watchlistId))
    .orderBy(asc(s.watchlistItems.addedAt));
  return rows.map((r) => r.id);
}

/** Which of the user's watchlists contain an instrument. */
export async function watchlistsContaining(db: Database, userId: string, instrumentId: number) {
  const rows = await db
    .select({ id: s.watchlists.id })
    .from(s.watchlistItems)
    .innerJoin(s.watchlists, eq(s.watchlists.id, s.watchlistItems.watchlistId))
    .where(and(eq(s.watchlists.userId, userId), eq(s.watchlistItems.instrumentId, instrumentId)));
  return rows.map((r) => r.id);
}

/* ----------------------------- Portfolios ---------------------------- */

export async function listPortfolios(db: Database, userId: string) {
  return db.select().from(s.portfolios).where(eq(s.portfolios.userId, userId)).orderBy(asc(s.portfolios.createdAt), asc(s.portfolios.id));
}

export async function getOwnedPortfolio(db: Database, userId: string, id: number) {
  const [p] = await db.select().from(s.portfolios).where(and(eq(s.portfolios.id, id), eq(s.portfolios.userId, userId)));
  if (!p) throw new NotFoundError("Portfolio");
  return p;
}

export const PortfolioInputSchema = z.object({ name, benchmarkInstrumentId: z.number().int().positive().nullable().optional() });

export async function createPortfolio(db: Database, userId: string, input: z.input<typeof PortfolioInputSchema>) {
  const p = PortfolioInputSchema.parse(input);
  const [row] = await db.insert(s.portfolios).values({ userId, name: p.name, benchmarkInstrumentId: p.benchmarkInstrumentId ?? null }).returning();
  return row!;
}

export async function updatePortfolio(db: Database, userId: string, id: number, input: Partial<z.input<typeof PortfolioInputSchema>>) {
  await getOwnedPortfolio(db, userId, id);
  const p = PortfolioInputSchema.partial().parse(input);
  const [row] = await db
    .update(s.portfolios)
    .set({ ...(p.name ? { name: p.name } : {}), ...(p.benchmarkInstrumentId !== undefined ? { benchmarkInstrumentId: p.benchmarkInstrumentId } : {}) })
    .where(and(eq(s.portfolios.id, id), eq(s.portfolios.userId, userId)))
    .returning();
  return row!;
}

export async function deletePortfolio(db: Database, userId: string, id: number) {
  await getOwnedPortfolio(db, userId, id);
  await db.delete(s.portfolios).where(and(eq(s.portfolios.id, id), eq(s.portfolios.userId, userId)));
}

export const TransactionInputSchema = z
  .object({
    instrumentId: z.number().int().positive(),
    type: z.enum(["BUY", "SELL", "DIVIDEND", "SPLIT"]),
    tradeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    quantity: z.number().finite().min(0).max(1e12).default(0),
    price: z.number().finite().min(0).max(1e9).default(0),
    fees: z.number().finite().min(0).max(1e9).default(0),
    amount: z.number().finite().positive().max(1e12).nullable().optional(),
    splitRatio: z.number().finite().positive().max(1000).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
  })
  .superRefine((t, ctx) => {
    if ((t.type === "BUY" || t.type === "SELL") && !(t.quantity > 0)) ctx.addIssue({ code: "custom", path: ["quantity"], message: "Quantity must be greater than zero" });
    if ((t.type === "BUY" || t.type === "SELL") && !(t.price > 0)) ctx.addIssue({ code: "custom", path: ["price"], message: "Price must be greater than zero" });
    if (t.type === "DIVIDEND" && !(t.amount && t.amount > 0)) ctx.addIssue({ code: "custom", path: ["amount"], message: "Dividend amount is required" });
    if (t.type === "SPLIT" && !(t.splitRatio && t.splitRatio > 0)) ctx.addIssue({ code: "custom", path: ["splitRatio"], message: "Split ratio is required" });
    if (t.tradeDate > new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)) ctx.addIssue({ code: "custom", path: ["tradeDate"], message: "Trade date cannot be in the future" });
  });
export type TransactionInput = z.input<typeof TransactionInputSchema>;

export async function listTransactions(db: Database, userId: string, portfolioId: number) {
  await getOwnedPortfolio(db, userId, portfolioId);
  return db
    .select({ tx: s.transactions, symbol: s.instruments.symbol, exchange: s.instruments.exchange, name: s.instruments.name })
    .from(s.transactions)
    .innerJoin(s.instruments, eq(s.instruments.id, s.transactions.instrumentId))
    .where(eq(s.transactions.portfolioId, portfolioId))
    .orderBy(asc(s.transactions.tradeDate), asc(s.transactions.id));
}

async function getOwnedTransaction(db: Database, userId: string, txId: number) {
  const [row] = await db
    .select({ tx: s.transactions })
    .from(s.transactions)
    .innerJoin(s.portfolios, eq(s.portfolios.id, s.transactions.portfolioId))
    .where(and(eq(s.transactions.id, txId), eq(s.portfolios.userId, userId)));
  if (!row) throw new NotFoundError("Transaction");
  return row.tx;
}

export async function insertTransaction(db: Database, userId: string, portfolioId: number, input: TransactionInput) {
  await getOwnedPortfolio(db, userId, portfolioId);
  const t = TransactionInputSchema.parse(input);
  const [inst] = await db.select({ id: s.instruments.id }).from(s.instruments).where(eq(s.instruments.id, t.instrumentId));
  if (!inst) throw new NotFoundError("Instrument");
  const [row] = await db.insert(s.transactions).values({ ...t, portfolioId, notes: t.notes ?? null }).returning();
  return row!;
}

export async function updateTransaction(db: Database, userId: string, txId: number, input: TransactionInput) {
  const existing = await getOwnedTransaction(db, userId, txId);
  const t = TransactionInputSchema.parse(input);
  const [row] = await db.update(s.transactions).set({ ...t, notes: t.notes ?? null }).where(eq(s.transactions.id, existing.id)).returning();
  return row!;
}

export async function deleteTransaction(db: Database, userId: string, txId: number) {
  const existing = await getOwnedTransaction(db, userId, txId);
  await db.delete(s.transactions).where(eq(s.transactions.id, existing.id));
  return existing;
}

export async function getTransactionForUser(db: Database, userId: string, txId: number) {
  return getOwnedTransaction(db, userId, txId);
}

/* ------------------------------- Alerts ------------------------------ */

export const AlertInputSchema = z.object({
  instrumentId: z.number().int().positive(),
  kind: z.enum(["PRICE_ABOVE", "PRICE_BELOW", "PCT_UP", "PCT_DOWN"]),
  threshold: z.number().finite().positive().max(1e9),
  repeat: z.boolean().default(false),
  note: z.string().max(200).nullable().optional(),
});

export async function listAlerts(db: Database, userId: string) {
  return db
    .select({ alert: s.alerts, symbol: s.instruments.symbol, exchange: s.instruments.exchange, name: s.instruments.name, sourceId: s.instruments.sourceId })
    .from(s.alerts)
    .innerJoin(s.instruments, eq(s.instruments.id, s.alerts.instrumentId))
    .where(eq(s.alerts.userId, userId))
    .orderBy(desc(s.alerts.createdAt));
}

export async function createAlert(db: Database, userId: string, input: z.input<typeof AlertInputSchema>) {
  const a = AlertInputSchema.parse(input);
  const [inst] = await db.select({ id: s.instruments.id }).from(s.instruments).where(eq(s.instruments.id, a.instrumentId));
  if (!inst) throw new NotFoundError("Instrument");
  const [row] = await db.insert(s.alerts).values({ ...a, userId, note: a.note ?? null }).returning();
  return row!;
}

export async function updateAlert(db: Database, userId: string, id: number, input: { active?: boolean; threshold?: number; repeat?: boolean }) {
  const patch = z.object({ active: z.boolean().optional(), threshold: z.number().finite().positive().optional(), repeat: z.boolean().optional() }).parse(input);
  const [row] = await db.update(s.alerts).set(patch).where(and(eq(s.alerts.id, id), eq(s.alerts.userId, userId))).returning();
  if (!row) throw new NotFoundError("Alert");
  return row;
}

export async function deleteAlert(db: Database, userId: string, id: number) {
  const res = await db.delete(s.alerts).where(and(eq(s.alerts.id, id), eq(s.alerts.userId, userId))).returning({ id: s.alerts.id });
  if (res.length === 0) throw new NotFoundError("Alert");
}

export async function listNotifications(db: Database, userId: string, limit = 50) {
  return db.select().from(s.notificationHistory).where(eq(s.notificationHistory.userId, userId)).orderBy(desc(s.notificationHistory.createdAt)).limit(limit);
}

export async function unreadNotificationCount(db: Database, userId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.notificationHistory)
    .where(and(eq(s.notificationHistory.userId, userId), isNull(s.notificationHistory.readAt), eq(s.notificationHistory.channel, "in_app")));
  return Number(row?.n ?? 0);
}

export async function markNotificationsRead(db: Database, userId: string, ids?: number[]) {
  const conds = [eq(s.notificationHistory.userId, userId), isNull(s.notificationHistory.readAt)];
  if (ids?.length) conds.push(inArray(s.notificationHistory.id, ids));
  await db.update(s.notificationHistory).set({ readAt: new Date() }).where(and(...conds));
}

/* ---------------------------- Research notes ------------------------- */

export const NoteInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160),
  body: z.string().max(50_000).default(""),
  instrumentId: z.number().int().positive().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
});

export async function listNotes(db: Database, userId: string, opts: { q?: string; instrumentId?: number } = {}) {
  const conds = [eq(s.researchNotes.userId, userId)];
  if (opts.instrumentId) conds.push(eq(s.researchNotes.instrumentId, opts.instrumentId));
  if (opts.q?.trim()) {
    const like = `%${opts.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conds.push(or(ilike(s.researchNotes.title, like), ilike(s.researchNotes.body, like))!);
  }
  return db
    .select({ note: s.researchNotes, symbol: s.instruments.symbol, exchange: s.instruments.exchange })
    .from(s.researchNotes)
    .leftJoin(s.instruments, eq(s.instruments.id, s.researchNotes.instrumentId))
    .where(and(...conds))
    .orderBy(desc(s.researchNotes.updatedAt));
}

export async function createNote(db: Database, userId: string, input: z.input<typeof NoteInputSchema>) {
  const n = NoteInputSchema.parse(input);
  const [row] = await db.insert(s.researchNotes).values({ ...n, instrumentId: n.instrumentId ?? null, userId }).returning();
  return row!;
}

export async function updateNote(db: Database, userId: string, id: number, input: z.input<typeof NoteInputSchema>) {
  const n = NoteInputSchema.parse(input);
  const [row] = await db
    .update(s.researchNotes)
    .set({ ...n, instrumentId: n.instrumentId ?? null, updatedAt: new Date() })
    .where(and(eq(s.researchNotes.id, id), eq(s.researchNotes.userId, userId)))
    .returning();
  if (!row) throw new NotFoundError("Note");
  return row;
}

export async function deleteNote(db: Database, userId: string, id: number) {
  const res = await db.delete(s.researchNotes).where(and(eq(s.researchNotes.id, id), eq(s.researchNotes.userId, userId))).returning({ id: s.researchNotes.id });
  if (res.length === 0) throw new NotFoundError("Note");
}

/* ---------------------------- Saved articles ------------------------- */

export async function saveArticle(db: Database, userId: string, articleId: number) {
  const [a] = await db.select({ id: s.newsArticles.id }).from(s.newsArticles).where(eq(s.newsArticles.id, articleId));
  if (!a) throw new NotFoundError("Article");
  await db.insert(s.savedArticles).values({ userId, articleId }).onConflictDoNothing();
}

export async function unsaveArticle(db: Database, userId: string, articleId: number) {
  await db.delete(s.savedArticles).where(and(eq(s.savedArticles.userId, userId), eq(s.savedArticles.articleId, articleId)));
}

export async function savedArticleIds(db: Database, userId: string) {
  const rows = await db.select({ id: s.savedArticles.articleId }).from(s.savedArticles).where(eq(s.savedArticles.userId, userId));
  return new Set(rows.map((r) => r.id));
}

/* ---------------------------- Saved screeners ------------------------ */

export async function listScreeners(db: Database, userId: string) {
  return db.select().from(s.savedScreeners).where(eq(s.savedScreeners.userId, userId)).orderBy(asc(s.savedScreeners.name));
}

export async function saveScreener(db: Database, userId: string, input: { name: string; config: unknown }) {
  const config = ScreenConfigSchema.parse(input.config);
  const [row] = await db
    .insert(s.savedScreeners)
    .values({ userId, name: name.parse(input.name), config: { ...config, page: 1 } })
    .onConflictDoUpdate({ target: [s.savedScreeners.userId, s.savedScreeners.name], set: { config: { ...config, page: 1 } } })
    .returning();
  return row!;
}

export async function deleteScreener(db: Database, userId: string, id: number) {
  const res = await db.delete(s.savedScreeners).where(and(eq(s.savedScreeners.id, id), eq(s.savedScreeners.userId, userId))).returning({ id: s.savedScreeners.id });
  if (res.length === 0) throw new NotFoundError("Screener");
}

/* ----------------------------- Workspaces ---------------------------- */

export const WIDGET_TYPES = ["indices", "movers", "watchlist", "chart", "news", "economy", "portfolio", "heatmap", "notes"] as const;

export const WidgetSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(WIDGET_TYPES),
  title: z.string().max(60).optional(),
  size: z.enum(["sm", "md", "lg"]).default("md"),
  config: z.record(z.string(), z.union([z.string().max(60), z.number(), z.boolean()])).default({}),
});
export const LayoutSchema = z.object({ widgets: z.array(WidgetSchema).max(24) });
export type WorkspaceLayout = z.infer<typeof LayoutSchema>;

export const DEFAULT_LAYOUT: WorkspaceLayout = {
  widgets: [
    { id: "w1", type: "indices", size: "lg", config: {} },
    { id: "w2", type: "chart", size: "md", config: { symbol: "NIFTY50", exchange: "INDEX" } },
    { id: "w3", type: "movers", size: "md", config: {} },
    { id: "w4", type: "watchlist", size: "md", config: {} },
    { id: "w5", type: "portfolio", size: "sm", config: {} },
    { id: "w6", type: "news", size: "md", config: {} },
    { id: "w7", type: "economy", size: "sm", config: {} },
  ],
};

export async function listWorkspaces(db: Database, userId: string) {
  return db.select().from(s.workspaceLayouts).where(eq(s.workspaceLayouts.userId, userId)).orderBy(desc(s.workspaceLayouts.isDefault), asc(s.workspaceLayouts.name));
}

export async function saveWorkspace(db: Database, userId: string, input: { id?: number; name: string; layout: unknown; isDefault?: boolean }) {
  const layout = LayoutSchema.parse(input.layout);
  const n = name.parse(input.name);
  return db.transaction(async (tx) => {
    if (input.isDefault) await tx.update(s.workspaceLayouts).set({ isDefault: false }).where(eq(s.workspaceLayouts.userId, userId));
    if (input.id) {
      const [row] = await tx
        .update(s.workspaceLayouts)
        .set({ name: n, layout, updatedAt: new Date(), ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}) })
        .where(and(eq(s.workspaceLayouts.id, input.id), eq(s.workspaceLayouts.userId, userId)))
        .returning();
      if (!row) throw new NotFoundError("Workspace");
      return row;
    }
    const [row] = await tx.insert(s.workspaceLayouts).values({ userId, name: n, layout, isDefault: input.isDefault ?? false }).returning();
    return row!;
  });
}

export async function deleteWorkspace(db: Database, userId: string, id: number) {
  const res = await db.delete(s.workspaceLayouts).where(and(eq(s.workspaceLayouts.id, id), eq(s.workspaceLayouts.userId, userId))).returning({ id: s.workspaceLayouts.id });
  if (res.length === 0) throw new NotFoundError("Workspace");
}

/* ------------------------------ Profile ------------------------------ */

export const ProfileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  notificationPrefs: z
    .object({ inApp: z.boolean(), email: z.boolean(), emailAddress: z.string().email().max(200).optional().or(z.literal("")) })
    .optional(),
  preferences: z
    .object({ defaultRange: z.enum(["1M", "3M", "6M", "YTD", "1Y", "3Y", "MAX"]).optional(), riskFreeRate: z.number().min(0).max(0.3).optional(), compactTables: z.boolean().optional() })
    .optional(),
});

export async function getProfile(db: Database, userId: string) {
  const [p] = await db.select().from(s.profiles).where(eq(s.profiles.userId, userId));
  return p ?? null;
}

export async function updateProfile(db: Database, userId: string, input: z.input<typeof ProfileUpdateSchema>) {
  const p = ProfileUpdateSchema.parse(input);
  const existing = await getProfile(db, userId);
  if (!existing) throw new NotFoundError("Profile");
  const [row] = await db
    .update(s.profiles)
    .set({
      ...(p.displayName ? { displayName: p.displayName } : {}),
      ...(p.notificationPrefs
        ? { notificationPrefs: { ...p.notificationPrefs, emailAddress: p.notificationPrefs.emailAddress || undefined } }
        : {}),
      ...(p.preferences ? { preferences: { ...existing.preferences, ...p.preferences } } : {}),
      updatedAt: new Date(),
    })
    .where(eq(s.profiles.userId, userId))
    .returning();
  return row!;
}

/* --------------------------- Economic events ------------------------- */

export const EventInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  country: z.string().trim().min(1).max(60),
  scheduledAt: z.coerce.date(),
  importance: z.enum(["low", "medium", "high"]).default("medium"),
  notes: z.string().max(500).nullable().optional(),
});

export async function listEvents(db: Database, userId: string, from?: Date, to?: Date) {
  const conds = [or(isNull(s.economicEvents.userId), eq(s.economicEvents.userId, userId))!];
  if (from) conds.push(sql`${s.economicEvents.scheduledAt} >= ${from.toISOString()}`);
  if (to) conds.push(sql`${s.economicEvents.scheduledAt} <= ${to.toISOString()}`);
  return db.select().from(s.economicEvents).where(and(...conds)).orderBy(asc(s.economicEvents.scheduledAt));
}

export async function createEvent(db: Database, userId: string, input: z.input<typeof EventInputSchema>) {
  const e = EventInputSchema.parse(input);
  const [row] = await db.insert(s.economicEvents).values({ ...e, userId, notes: e.notes ?? null, isSample: false }).returning();
  return row!;
}

export async function deleteEvent(db: Database, userId: string, id: number) {
  const res = await db.delete(s.economicEvents).where(and(eq(s.economicEvents.id, id), eq(s.economicEvents.userId, userId))).returning({ id: s.economicEvents.id });
  if (res.length === 0) throw new NotFoundError("Event");
}
