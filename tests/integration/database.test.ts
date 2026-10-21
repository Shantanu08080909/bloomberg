import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { authenticate, changePassword, countUsers, createSession, createUser, deleteSession, getSessionUser } from "@/lib/auth/core";
import { createDb, type Database } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { checkDatabaseHealth } from "@/lib/db/health";
import { setupDatabase } from "@/lib/db/seed";
import { checkLedgerChange } from "@/lib/finance/portfolio";
import { runScreen, ScreenConfigSchema } from "@/lib/finance/screener";
import { checkAlerts } from "@/lib/services/alerts-engine";
import { getPortfolioSummary, getRiskReport, getScreenRows } from "@/lib/services/analytics";
import { getBars, getBreadth, getIndices, getInstrument, getMovers, searchInstruments } from "@/lib/services/market";
import * as ud from "@/lib/services/user-data";

let handle: Awaited<ReturnType<typeof createDb>>;
let db: Database;
let alice: { id: string };
let bob: { id: string };

beforeAll(async () => {
  handle = await createDb({ PGLITE_DIR: ":memory:" } as unknown as NodeJS.ProcessEnv);
  const res = await setupDatabase(handle);
  expect(res.seeded).toBe(true);
  db = handle.db;
  alice = await createUser(db, { username: "alice", password: "correct-horse-1" });
  bob = await createUser(db, { username: "bob", password: "battery-staple-2" });
});

afterAll(async () => {
  await handle?.close();
});

describe("migrations and seed", () => {
  it("reports a healthy, populated database", async () => {
    const h = await checkDatabaseHealth(db, handle.mode);
    expect(h.ok).toBe(true);
    expect(h.instruments).toBeGreaterThan(100);
    expect(h.priceBars).toBeGreaterThan(50_000);
  });
  it("is idempotent", async () => {
    const again = await setupDatabase(handle);
    expect(again.seeded).toBe(false);
  });
});

describe("authentication", () => {
  it("rejects weak passwords and duplicate usernames", async () => {
    await expect(createUser(db, { username: "carol", password: "short" })).rejects.toThrow();
    await expect(createUser(db, { username: "ALICE", password: "another-pass-3" })).rejects.toThrow();
    expect(await countUsers(db)).toBe(2);
  });
  it("authenticates with the right password only", async () => {
    expect(await authenticate(db, "alice", "correct-horse-1")).toMatchObject({ username: "alice" });
    expect(await authenticate(db, "alice", "wrong-password-1")).toBeNull();
    expect(await authenticate(db, "nobody", "whatever-123")).toBeNull();
  });
  it("stores only a hash of the session token and expires sessions", async () => {
    const { token } = await createSession(db, alice.id, 1);
    const rows = await db.select().from(s.sessions).where(eq(s.sessions.userId, alice.id));
    expect(rows.some((r) => r.id === token)).toBe(false);
    expect((await getSessionUser(db, token))?.id).toBe(alice.id);
    await db.update(s.sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(s.sessions.userId, alice.id));
    expect(await getSessionUser(db, token)).toBeNull();
    expect(await getSessionUser(db, "garbage")).toBeNull();
  });
  it("logout deletes the session; password change revokes all sessions", async () => {
    const a = await createSession(db, bob.id, 1);
    await deleteSession(db, a.token);
    expect(await getSessionUser(db, a.token)).toBeNull();
    const b = await createSession(db, bob.id, 1);
    expect(await changePassword(db, bob.id, "wrong", "new-password-9")).toBe(false);
    expect(await changePassword(db, bob.id, "battery-staple-2", "new-password-9")).toBe(true);
    expect(await getSessionUser(db, b.token)).toBeNull();
    expect(await authenticate(db, "bob", "new-password-9")).not.toBeNull();
  });
});

describe("market reads", () => {
  it("searches by symbol, name and ISIN with prefix ranking", async () => {
    const r = await searchInstruments(db, "demo", "kaveri");
    expect(r[0]!.name).toMatch(/Kaveri/);
    const bySymbol = await searchInstruments(db, "demo", "NIRM");
    expect(bySymbol[0]!.symbol.startsWith("NIRM")).toBe(true);
    expect(await searchInstruments(db, "demo", "%")).toEqual([]);
  });
  it("loads indices, movers, breadth and bars", async () => {
    const idx = await getIndices(db, "demo");
    expect(idx.map((i) => i.symbol).slice(0, 3)).toEqual(["NIFTY50", "NIFTYBANK", "SENSEX"]);
    expect(idx[0]!.displayStatus).toBe("demo");
    const breadth = await getBreadth(db, idx[0]!.id, "demo");
    expect(breadth!.constituents).toBe(50);
    expect(breadth!.advancers + breadth!.decliners + breadth!.unchanged).toBe(50);
    const movers = await getMovers(db, "demo");
    expect(movers.gainers.every((g) => g.quote!.changePct! > 0)).toBe(true);
    const inst = await getInstrument(db, "demo", "NSE", "KVRBANK");
    const bars = await getBars(db, inst!.id, "demo", "2026-09-01");
    expect(bars.length).toBeGreaterThan(15);
    expect(bars.at(-1)!.date).toBe("2026-09-30");
  });
});

describe("watchlists (persistence and authorization)", () => {
  it("persists items and blocks other users", async () => {
    const [wl] = await ud.listWatchlists(db, alice.id);
    const inst = await getInstrument(db, "demo", "NSE", "KVRBANK");
    await ud.addToWatchlist(db, alice.id, wl!.id, inst!.id);
    await ud.addToWatchlist(db, alice.id, wl!.id, inst!.id); // idempotent
    expect(await ud.watchlistInstrumentIds(db, alice.id, wl!.id)).toEqual([inst!.id]);
    await expect(ud.watchlistInstrumentIds(db, bob.id, wl!.id)).rejects.toBeInstanceOf(ud.NotFoundError);
    await expect(ud.addToWatchlist(db, bob.id, wl!.id, inst!.id)).rejects.toBeInstanceOf(ud.NotFoundError);
    await expect(ud.deleteWatchlist(db, bob.id, wl!.id)).rejects.toBeInstanceOf(ud.NotFoundError);
    expect((await ud.listWatchlists(db, bob.id)).map((w) => w.id)).not.toContain(wl!.id);
  });
  it("creates, renames and deletes", async () => {
    const w = await ud.createWatchlist(db, alice.id, { name: "Banks" });
    await expect(ud.createWatchlist(db, alice.id, { name: "Banks" })).rejects.toThrow();
    await ud.renameWatchlist(db, alice.id, w.id, { name: "Lenders" });
    await ud.deleteWatchlist(db, alice.id, w.id);
    expect((await ud.listWatchlists(db, alice.id)).find((x) => x.id === w.id)).toBeUndefined();
  });
});

describe("portfolio transactions", () => {
  it("records, values and protects transactions", async () => {
    const [p] = await ud.listPortfolios(db, alice.id);
    const inst = await getInstrument(db, "demo", "NSE", "NIRMTECH");
    await ud.insertTransaction(db, alice.id, p!.id, { instrumentId: inst!.id, type: "BUY", tradeDate: "2026-01-05", quantity: 10, price: 3500, fees: 20 });
    const sell = await ud.insertTransaction(db, alice.id, p!.id, { instrumentId: inst!.id, type: "SELL", tradeDate: "2026-06-01", quantity: 4, price: 3800 });
    const summary = await getPortfolioSummary(db, alice.id, p!.id);
    expect(summary.issues).toEqual([]);
    const pos = summary.positions.find((x) => x.instrumentId === inst!.id)!;
    expect(pos.quantity).toBe(6);
    expect(pos.realizedPnl).toBeCloseTo(4 * 3800 - 4 * 3502, 6);
    expect(pos.marketValue).toBeCloseTo(6 * inst!.quote!.price, 6);
    expect(summary.totals.complete).toBe(true);

    // Over-selling is detected before writing.
    const existing = summary.txRows.map((r) => ({ ...r.tx, type: r.tx.type as "BUY" | "SELL" }));
    const issues = checkLedgerChange(existing, { id: -1, instrumentId: inst!.id, type: "SELL", tradeDate: "2026-07-01", quantity: 100, price: 1, fees: 0 });
    expect(issues.length).toBeGreaterThan(0);

    await expect(ud.deleteTransaction(db, bob.id, sell.id)).rejects.toBeInstanceOf(ud.NotFoundError);
    await expect(ud.listTransactions(db, bob.id, p!.id)).rejects.toBeInstanceOf(ud.NotFoundError);
    await expect(
      ud.insertTransaction(db, alice.id, p!.id, { instrumentId: inst!.id, type: "BUY", tradeDate: "2026-01-05", quantity: 0, price: 1 }),
    ).rejects.toThrow();
  });
});

describe("alerts engine", () => {
  it("fires once per quote and labels demo alerts", async () => {
    const inst = await getInstrument(db, "demo", "NSE", "KVRBANK");
    const below = await ud.createAlert(db, alice.id, { instrumentId: inst!.id, kind: "PRICE_ABOVE", threshold: inst!.quote!.price - 1 });
    const never = await ud.createAlert(db, alice.id, { instrumentId: inst!.id, kind: "PRICE_ABOVE", threshold: inst!.quote!.price * 10 });
    const r1 = await checkAlerts(db, { userId: alice.id });
    expect(r1.triggered).toBe(1);
    const notes = await ud.listNotifications(db, alice.id);
    expect(notes[0]!.title).toMatch(/^\[DEMO\]/);
    expect(notes[0]!.body).toMatch(/DEMO alert/);
    const [after] = await db.select().from(s.alerts).where(eq(s.alerts.id, below.id));
    expect(after!.active).toBe(false);
    const r2 = await checkAlerts(db, { userId: alice.id });
    expect(r2.triggered).toBe(0);
    const [n] = await db.select().from(s.alerts).where(and(eq(s.alerts.id, never.id)));
    expect(n!.active).toBe(true);
    expect(await ud.unreadNotificationCount(db, alice.id)).toBe(1);
    await ud.markNotificationsRead(db, alice.id);
    expect(await ud.unreadNotificationCount(db, alice.id)).toBe(0);
    await expect(ud.deleteAlert(db, bob.id, never.id)).rejects.toBeInstanceOf(ud.NotFoundError);
  });
  it("never fires on stale real data", async () => {
    const [src] = await db.select().from(s.dataSources).where(eq(s.dataSources.id, "alphavantage"));
    expect(src).toBeDefined();
    const [inst] = await db
      .insert(s.instruments)
      .values({ symbol: "TESTREAL", exchange: "BSE", name: "Test", instrumentType: "EQUITY", sourceId: "alphavantage" })
      .returning();
    await db.insert(s.quotes).values({ instrumentId: inst!.id, sourceId: "alphavantage", price: 100, changePct: 1, asOf: new Date("2020-01-01"), dataStatus: "eod" });
    await ud.createAlert(db, bob.id, { instrumentId: inst!.id, kind: "PRICE_ABOVE", threshold: 50 });
    const r = await checkAlerts(db, { userId: bob.id });
    expect(r).toMatchObject({ triggered: 0, skippedStale: 1 });
  });
});

describe("screener, risk and other user records", () => {
  it("screens the demo universe on the server", async () => {
    const rows = await getScreenRows(db, "demo");
    expect(rows.length).toBeGreaterThan(90);
    expect(rows.every((r) => r.rsi14 == null || (r.rsi14 >= 0 && r.rsi14 <= 100))).toBe(true);
    const res = runScreen(rows, ScreenConfigSchema.parse({ filters: [{ field: "pe", op: "lt", value: 15 }], exchanges: ["NSE"] }));
    expect(res.allRows.every((r) => r.pe! < 15 && r.exchange === "NSE")).toBe(true);
    // Banks have no debt-to-equity in demo data: coverage is honest, not zero-filled.
    expect(rows.filter((r) => r.sector === "Banking").every((r) => r.debtToEquity === null)).toBe(true);
  });
  it("computes a risk report against a benchmark", async () => {
    const a = await getInstrument(db, "demo", "NSE", "KVRBANK");
    const b = await getInstrument(db, "demo", "NSE", "URJAOIL");
    const nifty = await getInstrument(db, "demo", "INDEX", "NIFTY50");
    const r = await getRiskReport(db, "demo", [a!.id, b!.id], { [a!.id]: 1, [b!.id]: 1 }, nifty!.id, 0.065);
    expect(r && !r.insufficient).toBe(true);
    if (r && !r.insufficient) {
      expect(r.portfolio.beta).toBeGreaterThan(0);
      expect(r.correlation.matrix[0]![0]).toBe(1);
      expect(r.stress.length).toBeGreaterThan(0);
    }
  });
  it("scopes notes, screeners, workspaces and events to their owner", async () => {
    const note = await ud.createNote(db, alice.id, { title: "Thesis", body: "Demo", tags: ["bank"] });
    expect((await ud.listNotes(db, alice.id, { q: "thes" })).length).toBe(1);
    expect(await ud.listNotes(db, bob.id)).toEqual([]);
    await expect(ud.updateNote(db, bob.id, note.id, { title: "x" })).rejects.toBeInstanceOf(ud.NotFoundError);

    const scr = await ud.saveScreener(db, alice.id, { name: "Cheap", config: { filters: [{ field: "pe", op: "lt", value: 15 }] } });
    await expect(ud.deleteScreener(db, bob.id, scr.id)).rejects.toBeInstanceOf(ud.NotFoundError);

    const ws = await ud.saveWorkspace(db, alice.id, { name: "Main", layout: ud.DEFAULT_LAYOUT, isDefault: true });
    await ud.saveWorkspace(db, alice.id, { name: "Second", layout: { widgets: [] }, isDefault: true });
    const list = await ud.listWorkspaces(db, alice.id);
    expect(list.filter((w) => w.isDefault).map((w) => w.name)).toEqual(["Second"]);
    await expect(ud.saveWorkspace(db, bob.id, { id: ws.id, name: "Hijack", layout: { widgets: [] } })).rejects.toBeInstanceOf(ud.NotFoundError);
    await expect(ud.saveWorkspace(db, alice.id, { name: "Bad", layout: { widgets: [{ id: "x", type: "evil" }] } })).rejects.toThrow();

    const ev = await ud.createEvent(db, alice.id, { title: "My event", country: "India", scheduledAt: "2026-11-01T05:00:00Z" });
    expect((await ud.listEvents(db, bob.id)).some((e) => e.id === ev.id)).toBe(false);
    expect((await ud.listEvents(db, bob.id)).some((e) => e.isSample)).toBe(true);
  });
});
