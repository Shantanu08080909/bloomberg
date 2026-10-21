import "server-only";
import { z } from "zod";

/**
 * Server-only configuration. Secrets read here must never be passed to client
 * components. Nothing in this file uses the NEXT_PUBLIC_ prefix.
 */
const EnvSchema = z.object({
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().max(90).default(14),
  COOKIE_SECURE: z.enum(["true", "false", "auto"]).default("auto"),
  ALLOW_REGISTRATION: z.enum(["true", "false"]).default("false"),

  MARKET_DATA_SOURCE: z.enum(["demo", "alphavantage"]).default("demo"),
  ALPHAVANTAGE_API_KEY: z.string().optional(),
  ALPHAVANTAGE_DAILY_LIMIT: z.coerce.number().int().positive().default(25),
  ALPHAVANTAGE_SYMBOLS: z.string().default(""),
  ALPHAVANTAGE_DATA_STATUS: z.enum(["delayed", "eod"]).default("eod"),

  FRED_API_KEY: z.string().optional(),
  FRED_SERIES: z.string().default("FEDFUNDS,CPIAUCSL,DGS10,DGS2,UNRATE,DEXINUS"),

  NEWS_RSS_FEEDS: z.string().default(""),

  STALE_AFTER_MINUTES_LIVE: z.coerce.number().positive().default(15),
  STALE_AFTER_MINUTES_DELAYED: z.coerce.number().positive().default(60),
  STALE_AFTER_HOURS_EOD: z.coerce.number().positive().default(96),

  SCHEDULER_ENABLED: z.enum(["true", "false"]).default("true"),
  ALERT_CHECK_INTERVAL_SECONDS: z.coerce.number().int().min(15).default(60),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

export type AppConfig = z.infer<typeof EnvSchema>;

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;
  const raw = Object.fromEntries(
    Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v]),
  );
  cached = EnvSchema.parse(raw);
  return cached;
}

export function resetConfigForTests() {
  cached = null;
}

export const csvList = (value: string) =>
  value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** Non-secret summary of configuration, safe to show in the UI. */
export function describeConfig() {
  const c = getConfig();
  return {
    database: c.DATABASE_URL ? "PostgreSQL server (DATABASE_URL)" : "Embedded PostgreSQL (PGlite)",
    marketDataSource: c.MARKET_DATA_SOURCE,
    alphaVantageConfigured: Boolean(c.ALPHAVANTAGE_API_KEY),
    fredConfigured: Boolean(c.FRED_API_KEY),
    rssFeedCount: csvList(c.NEWS_RSS_FEEDS).length,
    smtpConfigured: Boolean(c.SMTP_HOST && c.SMTP_FROM),
    schedulerEnabled: c.SCHEDULER_ENABLED === "true",
    alertCheckIntervalSeconds: c.ALERT_CHECK_INTERVAL_SECONDS,
    registrationAllowed: c.ALLOW_REGISTRATION === "true",
  };
}
