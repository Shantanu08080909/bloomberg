import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const money = (name: string) => numeric(name, { precision: 20, scale: 4, mode: "number" });
const qty = (name: string) => numeric(name, { precision: 24, scale: 6, mode: "number" });
const ratio = (name: string) => numeric(name, { precision: 20, scale: 6, mode: "number" });

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the random session token; the raw token only lives in the cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  baseCurrency: text("base_currency").notNull().default("INR"),
  /** { inApp: boolean, email: boolean, emailAddress?: string } */
  notificationPrefs: jsonb("notification_prefs")
    .$type<{ inApp: boolean; email: boolean; emailAddress?: string }>()
    .notNull()
    .default({ inApp: true, email: false }),
  /** UI preferences such as default chart range. */
  preferences: jsonb("preferences").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Data provenance                                                     */
/* ------------------------------------------------------------------ */

export const dataSources = pgTable("data_sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // market | news | economic
  enabled: boolean("enabled").notNull().default(false),
  /** demo | live | delayed | eod */
  defaultStatus: text("default_status").notNull(),
  homepage: text("homepage"),
  termsNote: text("terms_note").notNull().default(""),
  lastSuccessAt: ts("last_success_at"),
  lastErrorAt: ts("last_error_at"),
  lastError: text("last_error"),
  refreshIntervalMinutes: integer("refresh_interval_minutes").notNull().default(60),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const dataRefreshRuns = pgTable(
  "data_refresh_runs",
  {
    id: serial("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "cascade" }),
    dataset: text("dataset").notNull(),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    status: text("status").notNull(), // running | success | error | skipped
    recordCount: integer("record_count").notNull().default(0),
    message: text("message"),
  },
  (t) => [index("refresh_runs_source_idx").on(t.sourceId, t.startedAt)],
);

/** Small key/value store for app-level state such as the worker heartbeat. */
export const appState = pgTable("app_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Market reference data                                               */
/* ------------------------------------------------------------------ */

export const instruments = pgTable(
  "instruments",
  {
    id: serial("id").primaryKey(),
    symbol: text("symbol").notNull(),
    exchange: text("exchange").notNull(), // NSE | BSE | INDEX
    name: text("name").notNull(),
    isin: text("isin"),
    /** Exchange-specific code, e.g. a BSE scrip code. */
    exchangeCode: text("exchange_code"),
    /** Groups listings of the same issuer across exchanges. */
    issuerKey: text("issuer_key"),
    instrumentType: text("instrument_type").notNull(), // EQUITY | INDEX | ETF
    sector: text("sector"),
    industry: text("industry"),
    currency: text("currency").notNull().default("INR"),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id),
    description: text("description"),
    listedSince: date("listed_since", { mode: "string" }),
  },
  (t) => [
    uniqueIndex("instruments_exchange_symbol_uq").on(t.exchange, t.symbol, t.sourceId),
    index("instruments_name_idx").on(t.name),
    index("instruments_isin_idx").on(t.isin),
  ],
);

export const indexMetadata = pgTable("index_metadata", {
  instrumentId: integer("instrument_id")
    .primaryKey()
    .references(() => instruments.id, { onDelete: "cascade" }),
  family: text("family").notNull(),
  baseValue: money("base_value").notNull(),
  baseDate: date("base_date", { mode: "string" }).notNull(),
  methodology: text("methodology").notNull(),
});

export const indexConstituents = pgTable(
  "index_constituents",
  {
    indexId: integer("index_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    weight: ratio("weight").notNull(),
  },
  (t) => [primaryKey({ columns: [t.indexId, t.instrumentId] })],
);

export const quotes = pgTable(
  "quotes",
  {
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id),
    price: money("price").notNull(),
    open: money("open"),
    high: money("high"),
    low: money("low"),
    prevClose: money("prev_close"),
    change: money("change"),
    changePct: ratio("change_pct"),
    volume: bigint("volume", { mode: "number" }),
    /** Time the price applies to, as reported by the source. */
    asOf: ts("as_of").notNull(),
    /** Time this application received the record. */
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
    /** demo | live | delayed | eod */
    dataStatus: text("data_status").notNull(),
  },
  (t) => [primaryKey({ columns: [t.instrumentId, t.sourceId] })],
);

export const priceBars = pgTable(
  "price_bars",
  {
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id),
    date: date("date", { mode: "string" }).notNull(),
    open: money("open").notNull(),
    high: money("high").notNull(),
    low: money("low").notNull(),
    close: money("close").notNull(),
    volume: bigint("volume", { mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.instrumentId, t.sourceId, t.date] }),
    index("price_bars_date_idx").on(t.date),
  ],
);

export const companyFundamentals = pgTable(
  "company_fundamentals",
  {
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id),
    asOf: date("as_of", { mode: "string" }).notNull(),
    /** INR crore */
    marketCapCr: money("market_cap_cr"),
    sharesOutstanding: bigint("shares_outstanding", { mode: "number" }),
    pe: ratio("pe"),
    pb: ratio("pb"),
    eps: money("eps"),
    bookValuePerShare: money("book_value_per_share"),
    roe: ratio("roe"),
    debtToEquity: ratio("debt_to_equity"),
    dividendYield: ratio("dividend_yield"),
    revenueGrowth: ratio("revenue_growth"),
    profitGrowth: ratio("profit_growth"),
    beta: ratio("beta"),
  },
  (t) => [primaryKey({ columns: [t.instrumentId, t.sourceId] })],
);

export const financialStatements = pgTable(
  "financial_statements",
  {
    id: serial("id").primaryKey(),
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id),
    statementType: text("statement_type").notNull(), // income | balance | cashflow
    fiscalYear: integer("fiscal_year").notNull(),
    currency: text("currency").notNull().default("INR"),
    unit: text("unit").notNull().default("crore"),
    lineItems: jsonb("line_items").$type<Record<string, number | null>>().notNull(),
  },
  (t) => [
    uniqueIndex("fin_statements_uq").on(t.instrumentId, t.sourceId, t.statementType, t.fiscalYear),
  ],
);

export const corporateActions = pgTable(
  "corporate_actions",
  {
    id: serial("id").primaryKey(),
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id),
    actionType: text("action_type").notNull(), // DIVIDEND | SPLIT | BONUS | RIGHTS
    exDate: date("ex_date", { mode: "string" }).notNull(),
    recordDate: date("record_date", { mode: "string" }),
    /** DIVIDEND: { amountPerShare }, SPLIT/BONUS: { ratioFrom, ratioTo } */
    details: jsonb("details").$type<Record<string, number | string>>().notNull(),
    description: text("description").notNull(),
  },
  (t) => [index("corp_actions_instrument_idx").on(t.instrumentId, t.exDate)],
);

/* ------------------------------------------------------------------ */
/* News and economics                                                  */
/* ------------------------------------------------------------------ */

export const newsArticles = pgTable(
  "news_articles",
  {
    id: serial("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    url: text("url"),
    publisher: text("publisher").notNull(),
    publishedAt: ts("published_at").notNull(),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
    categories: text("categories").array().notNull().default(sql`'{}'::text[]`),
    tickers: text("tickers").array().notNull().default(sql`'{}'::text[]`),
    isSample: boolean("is_sample").notNull().default(false),
  },
  (t) => [
    uniqueIndex("news_source_external_uq").on(t.sourceId, t.externalId),
    index("news_published_idx").on(t.publishedAt),
  ],
);

export const economicSeries = pgTable("economic_series", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  country: text("country").notNull(),
  category: text("category").notNull(), // rates | inflation | growth | fx | yields | production
  unit: text("unit").notNull(),
  frequency: text("frequency").notNull(),
  sourceId: text("source_id")
    .notNull()
    .references(() => dataSources.id),
  sourceSeriesId: text("source_series_id"),
  description: text("description").notNull().default(""),
  /** Time the source says it last published this series, if known. */
  publishedAt: ts("published_at"),
  fetchedAt: ts("fetched_at"),
});

export const economicObservations = pgTable(
  "economic_observations",
  {
    seriesId: text("series_id")
      .notNull()
      .references(() => economicSeries.id, { onDelete: "cascade" }),
    /** Observation period (e.g. month start), not the publication time. */
    periodDate: date("period_date", { mode: "string" }).notNull(),
    value: ratio("value"),
  },
  (t) => [primaryKey({ columns: [t.seriesId, t.periodDate] })],
);

export const economicEvents = pgTable(
  "economic_events",
  {
    id: serial("id").primaryKey(),
    /** null = provided by a data source; otherwise added by this user. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    sourceId: text("source_id").references(() => dataSources.id),
    title: text("title").notNull(),
    country: text("country").notNull(),
    scheduledAt: ts("scheduled_at").notNull(),
    importance: text("importance").notNull().default("medium"),
    notes: text("notes"),
    isSample: boolean("is_sample").notNull().default(false),
  },
  (t) => [index("econ_events_time_idx").on(t.scheduledAt)],
);

/* ------------------------------------------------------------------ */
/* User-owned records                                                  */
/* ------------------------------------------------------------------ */

export const watchlists = pgTable(
  "watchlists",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("watchlists_user_name_uq").on(t.userId, t.name)],
);

export const watchlistItems = pgTable(
  "watchlist_items",
  {
    id: serial("id").primaryKey(),
    watchlistId: integer("watchlist_id")
      .notNull()
      .references(() => watchlists.id, { onDelete: "cascade" }),
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    addedAt: ts("added_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("watchlist_items_uq").on(t.watchlistId, t.instrumentId)],
);

export const portfolios = pgTable(
  "portfolios",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    baseCurrency: text("base_currency").notNull().default("INR"),
    benchmarkInstrumentId: integer("benchmark_instrument_id").references(() => instruments.id, {
      onDelete: "set null",
    }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("portfolios_user_name_uq").on(t.userId, t.name)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    portfolioId: integer("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id),
    /** BUY | SELL | DIVIDEND | SPLIT */
    type: text("type").notNull(),
    tradeDate: date("trade_date", { mode: "string" }).notNull(),
    quantity: qty("quantity").notNull().default(0),
    price: money("price").notNull().default(0),
    fees: money("fees").notNull().default(0),
    /** DIVIDEND: total cash received. */
    amount: money("amount"),
    /** SPLIT: new shares per old share, e.g. 2 for a 1:2 split. */
    splitRatio: ratio("split_ratio"),
    notes: text("notes"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("transactions_portfolio_idx").on(t.portfolioId, t.tradeDate)],
);

export const alerts = pgTable(
  "alerts",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    /** PRICE_ABOVE | PRICE_BELOW | PCT_UP | PCT_DOWN */
    kind: text("kind").notNull(),
    threshold: ratio("threshold").notNull(),
    active: boolean("active").notNull().default(true),
    repeat: boolean("repeat").notNull().default(false),
    note: text("note"),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastCheckedAt: ts("last_checked_at"),
    lastTriggeredAt: ts("last_triggered_at"),
  },
  (t) => [index("alerts_user_idx").on(t.userId)],
);

export const notificationHistory = pgTable(
  "notification_history",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    alertId: integer("alert_id").references(() => alerts.id, { onDelete: "set null" }),
    channel: text("channel").notNull(), // in_app | email
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** Data status of the price that triggered the alert. */
    dataStatus: text("data_status"),
    dataAsOf: ts("data_as_of"),
    deliveryStatus: text("delivery_status").notNull().default("delivered"),
    createdAt: ts("created_at").notNull().defaultNow(),
    readAt: ts("read_at"),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export const researchNotes = pgTable(
  "research_notes",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    instrumentId: integer("instrument_id").references(() => instruments.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("notes_user_idx").on(t.userId, t.updatedAt)],
);

export const savedArticles = pgTable(
  "saved_articles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    articleId: integer("article_id")
      .notNull()
      .references(() => newsArticles.id, { onDelete: "cascade" }),
    savedAt: ts("saved_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.articleId] })],
);

export const savedScreeners = pgTable(
  "saved_screeners",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("saved_screeners_user_name_uq").on(t.userId, t.name)],
);

export const workspaceLayouts = pgTable(
  "workspace_layouts",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    layout: jsonb("layout").$type<Record<string, unknown>>().notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("workspace_user_name_uq").on(t.userId, t.name)],
);
