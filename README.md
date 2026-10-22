# OpenFinance Terminal

A local, single-machine financial research terminal focused on Indian markets (NSE and BSE). It runs on your computer with no paid services and no API keys, using a clearly labelled **demo-data mode**, and can be connected to real data providers when you have suitable credentials and usage rights.

> **Demo mode is not real market data.** Out of the box every price, fundamental, index level, headline and economic figure is synthetic, generated deterministically on your machine about **fictional companies**. Every affected screen carries a persistent “DEMO DATA — NOT REAL MARKET PRICES” banner and per-value DEMO labels.

OpenFinance Terminal is an original project. It is not affiliated with Bloomberg, NSE, BSE, SEBI, RBI or any data vendor and does not use their data, software, trademarks or interface assets. Nothing in it is investment, tax or legal advice.

---

## Quick start

### Run it in the cloud with GitHub Codespaces (no install)

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/Shantanu08080909/bloomberg?quickstart=1)

Click the button, then **Create codespace**. The first start takes about 3–4 minutes (install, database setup, build); the terminal then opens on port 3000 in a new browser tab. If it does not open, go to the **Ports** tab and click the globe icon next to port 3000. The URL is private to your GitHub account by default; to share it, right-click port 3000 → **Port visibility → Public**. Codespaces stop after 30 minutes of inactivity; your data persists until the codespace is deleted. Personal GitHub accounts include a monthly free usage quota.

GitHub Pages cannot host this app: it serves static files only, and the terminal needs a running server and database.

### Run it on your computer

Requirements: **Node.js 20.9 or newer** (Node 22 LTS recommended) and npm. Nothing else — the database is embedded.

### Windows (PowerShell)

```powershell
git clone https://github.com/Shantanu08080909/bloomberg.git
cd bloomberg
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

### macOS / Linux

```bash
git clone https://github.com/Shantanu08080909/bloomberg.git
cd bloomberg
./scripts/start.sh
```

### Manually (any OS)

```bash
npm install
cp .env.example .env.local      # Windows: copy .env.example .env.local
npm run db:setup                # migrations + deterministic demo data (~10 s)
npm run dev                     # http://localhost:3000
```

Open **http://localhost:3000**. On first visit you create the owner account (there are no default credentials). The terminal then starts in demo mode.

For a production build: `npm run build && npm run start` (or `./scripts/start.sh --prod`, `.\scripts\start.ps1 -Prod`).

---

## What's included

| Area | Highlights |
| --- | --- |
| **Dashboard** | Index cards with sparklines, interactive index chart, market breadth, gainers/losers/most active, searchable securities table, watchlist preview, portfolio summary, news, economic events, data-source status, refresh, IST clock and session state |
| **Indian Markets** | Index table with breadth and methodology, NSE/BSE toggle, sector heatmap (area = market cap, colour = change), cap-weighted sector performance, index constituents with weights |
| **Stock Explorer / Security Details** | Global search by symbol, name, ISIN or BSE code; security pages with candlestick/line/area charts, D/W/M intervals, 1M–MAX ranges, crosshair legend, SMA/EMA/Bollinger overlays, volume, 52-week stats, ratios, statements, peers, other listings, dividends and corporate actions, related news, linked notes, watchlist/alert/note actions, CSV export |
| **Company Research** | Income statement, balance sheet, cash flow (5 years), revenue/profit/margin/ROE charts, CAGR, sector-median multiples, peer table |
| **Stock Screener** | Exchange/type/sector universe, numeric filters on price, fundamentals and technicals (SMA 50/200, RSI, volatility), AND/OR logic, coverage per field, server-side filtering, sorting, pagination, column selection, saved screens, CSV export |
| **Watchlists** | Multiple named lists, add/remove, persistent |
| **Portfolio Manager** | Paper portfolios, BUY/SELL/DIVIDEND/SPLIT ledger with edit/delete, weighted-average cost, realised/unrealised P&L, fees, dividends, allocation by holding/sector, concentration, time-weighted performance vs benchmark, oversell and consistency checks, CSV exports |
| **Technical Analysis** | SMA, EMA, Bollinger Bands, RSI, MACD, ATR, volume average, rolling volatility, drawdown — configurable parameters, separate indicator panes |
| **Valuation Lab** | DCF (CAPM → WACC, Gordon or exit-multiple terminal value, mid-year option, sensitivity grid), dividend discount (Gordon, two-stage), comparable multiples, scenario analysis, CAGR, compound interest, SIP with step-up, XIRR, break-even. Inputs from the dataset are marked “sourced” |
| **Risk Analytics** | Annualised return/volatility, Sharpe, Sortino, max drawdown, beta, correlation to benchmark, correlation matrix, concentration (HHI), sector weights, worst historical 20-day benchmark windows |
| **Economics, Yield & Rates, Calendar** | Indicator tables with observation period / publication time / fetch time kept separate, multi-series comparison, yield curve vs one year earlier, policy rate, term spread, FX; user-managed event calendar (no invented future schedule) |
| **News** | Search, topic/ticker filters, saved articles, attribution and original links; labelled sample set when no feed is configured |
| **Corporate Actions, Research Notes, Alerts** | Filterable actions; plain-text notes linked to securities; price/percent alerts with history, in-app and optional email notifications, honest background-monitoring status |
| **Data Explorer** | Dataset catalog with schemas, counts and freshness, bounded validated queries, pagination, permitted CSV export, CSV import of official series you download yourself |
| **Workspace Builder** | Drag-and-drop (mouse or keyboard) widget layout, nine widget types, sizes, per-widget configuration, named layouts, default layout, reset |
| **Settings, Provider Status, Help** | Profile, notification preferences, password change, read-only server configuration; per-source configuration, last success/error, refresh history, manual refresh, scheduler heartbeat; full documentation |

Keyboard: **Ctrl/⌘ K** or **/** opens search; ↑ ↓ Enter Esc navigate it.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run build` | Production build (type-checks and lints) |
| `npm run start` | Serve the production build on port 3000 |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript strict type check |
| `npm run test` | All Vitest unit and integration tests |
| `npm run test:unit` / `npm run test:integration` | One suite only |
| `npm run test:e2e` | Playwright end-to-end tests (run `npm run build` first; uses port 3100 and `./data/e2e`) |
| `npm run db:setup` (alias `db:migrate`) | Apply migrations; load demo data if missing |
| `npm run db:seed` | Reload the deterministic demo dataset (idempotent) |
| `npm run db:health` | Check the database is reachable and migrated |
| `npm run db:generate` | Generate a new SQL migration after editing `src/lib/db/schema.ts` |
| `npm run verify` | lint + typecheck + tests + build |

Playwright needs a Chromium browser: run `npx playwright install chromium` once if it is not already installed.

---

## Database

The app uses **PostgreSQL** in one of two modes, chosen automatically:

1. **Embedded PostgreSQL (default)** — [PGlite](https://pglite.dev), PostgreSQL compiled to WebAssembly, stored in `./data/pglite`. No installation, works on Windows, macOS and Linux. Only one process can open the data directory at a time, so stop the server before running `npm run db:*` scripts.
2. **PostgreSQL server** — set `DATABASE_URL` in `.env.local`. A ready-made server is in `docker-compose.yml`:

   ```bash
   docker compose up -d
   # .env.local
   DATABASE_URL=postgres://openfinance:change-me@localhost:5432/openfinance
   npm run db:setup
   ```

   Any PostgreSQL 14+ works (tested with 16).

Migrations are versioned SQL in `drizzle/`, generated from the schema in `src/lib/db/schema.ts` by drizzle-kit and applied by `npm run db:setup` (and automatically on first server start). Moving from embedded to server mode: run `npm run db:setup` against the new `DATABASE_URL`; user records are not migrated automatically between the two stores.

Tables: users, sessions, profiles, data_sources, data_refresh_runs, app_state, instruments, index_metadata, index_constituents, quotes, price_bars, company_fundamentals, financial_statements, corporate_actions, news_articles, economic_series, economic_observations, economic_events, watchlists, watchlist_items, portfolios, transactions, alerts, notification_history, research_notes, saved_articles, saved_screeners, workspace_layouts — with foreign keys, unique constraints, indexes, `numeric` money columns and `timestamptz` timestamps.

---

## Configuration

Copy `.env.example` to `.env.local`. Everything is optional.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | *(empty)* | PostgreSQL server; empty = embedded PGlite |
| `PGLITE_DIR` | `./data/pglite` | Embedded database folder |
| `ALLOW_REGISTRATION` | `false` | Allow accounts beyond the first |
| `SESSION_TTL_DAYS` | `14` | Session lifetime |
| `COOKIE_SECURE` | `auto` | `true` behind HTTPS |
| `MARKET_DATA_SOURCE` | `demo` | `demo` or `alphavantage` |
| `ALPHAVANTAGE_API_KEY`, `ALPHAVANTAGE_SYMBOLS`, `ALPHAVANTAGE_DAILY_LIMIT`, `ALPHAVANTAGE_DATA_STATUS` | — | Alpha Vantage adapter |
| `FRED_API_KEY`, `FRED_SERIES` | — | FRED adapter |
| `NEWS_RSS_FEEDS` | — | Comma-separated feeds you may use |
| `STALE_AFTER_MINUTES_LIVE` / `_DELAYED`, `STALE_AFTER_HOURS_EOD` | 15 / 60 / 96 | When real data is labelled STALE |
| `SCHEDULER_ENABLED`, `ALERT_CHECK_INTERVAL_SECONDS` | `true`, `60` | In-process alert checks and provider refreshes |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | — | Optional alert emails |

Secrets are read only on the server (`src/lib/config.ts` is `server-only`); no variable uses the `NEXT_PUBLIC_` prefix.

---

## Data sources — what is and isn't connected

| Source | Status | Notes |
| --- | --- | --- |
| Demo generator | **Working, default** | ~60 fictional companies with NSE and BSE listings, 3 years of weekday bars ending 30 Sep 2026, six demo index series (computed from demo constituents; **not** official NIFTY/SENSEX values), fundamentals, statements, corporate actions, sample news and synthetic macro series. Identical on every machine. |
| Alpha Vantage | Adapter implemented, **not verified live** | BSE quotes and daily bars (`SYMBOL.BSE`). Needs a key. Free tier is heavily rate-limited. No fundamentals/indices/corporate actions. Exports blocked. |
| FRED | Adapter implemented, **not verified live** | US and selected international series. Needs a free key. Subject to the FRED API Terms of Use. |
| RSS / Atom | Adapter implemented, **not verified live** | Headlines, links, times and short feed descriptions only. You must confirm each feed's terms. |
| NSE, BSE | **Not integrated** | Exchange data is licensed; no free API with redistribution rights was identified and the websites are not scraped. Integrate through a licensed vendor. |
| RBI (DBIE), MoSPI, SEBI | **Not integrated** | No documented, stable API with suitable terms was identified. Use Data Explorer → Import CSV for releases you download yourself. |

“Not verified live” means the adapter was written from public documentation and tested with mocked HTTP responses; the build environment had no network access to those services. Each adapter applies request timeouts, bounded exponential-backoff retries, local rate limits and Zod response validation, and records every refresh in `data_refresh_runs`.

To add a provider, implement `MarketDataProvider`, `NewsProvider` or `EconomicDataProvider` from `src/lib/market/types.ts`, register it in `src/lib/providers/registry.ts`, and ingest through the helpers in `src/lib/ingest.ts`.

### Data labels

`DEMO`, `LIVE`, `DELAYED`, `END OF DAY`, `STALE`, `UNAVAILABLE`. Each quote carries its source timestamp (`as_of`) and the time it was stored (`fetched_at`). Demo data never becomes live or stale. Missing fundamentals are shown as unavailable and are never zero-filled.

---

## Architecture

A modular monolith on **Next.js 15 (App Router) + React 19 + TypeScript (strict)**, Tailwind CSS 4, TradingView Lightweight Charts, Apache ECharts, Drizzle ORM, Zod, Vitest and Playwright.

```
src/
  app/(auth)/            login, first-run setup, registration
  app/(terminal)/        23 sections (server components + client islands)
  app/api/               route handlers (auth, CSRF, rate limits, validation)
  components/            UI primitives, shell, charts, tables
  lib/db/                schema, client (PGlite | pg), seed, health
  lib/market/            normalized types, provider interfaces, freshness labels
  lib/providers/         demo generator, Alpha Vantage, FRED, RSS, HTTP policy
  lib/finance/           indicators, valuation, risk, portfolio ledger, screener
  lib/services/          market reads, user-scoped data, analytics, alerts, refresh
  lib/server/            DB bootstrap, API wrapper, scheduler, export policy
drizzle/                 versioned SQL migrations
scripts/                 db setup/seed/health, start.sh, start.ps1
tests/unit, tests/integration, tests/e2e
```

Financial calculations live in pure, unit-tested modules under `src/lib/finance`; charts only render their output.

---

## Security

- Passwords hashed with **bcrypt** (cost 12). Sessions are 256-bit random tokens; only their SHA-256 hash is stored. Cookies are `HttpOnly`, `SameSite=Lax`, `Secure` over HTTPS. Password change revokes all sessions. Sign-in is rate limited.
- No default credentials; the first visitor creates the owner, further registration is off unless `ALLOW_REGISTRATION=true`.
- **Authorization on the server for every user-owned record**: each query filters by the authenticated user's id (tests verify one user cannot read, modify or delete another's watchlists, portfolios, transactions, alerts, notes, screens, workspaces or events).
- State-changing requests are rejected when `Origin`/`Sec-Fetch-Site` indicate another site (CSRF), in addition to SameSite cookies.
- All SQL is parameterised through Drizzle; inputs are validated with Zod; React escapes output and no user content is rendered as HTML; strict Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`.
- CSV exports neutralise spreadsheet formulas, are capped at 10,000 rows, and are blocked for sources whose terms restrict redistribution.
- API routes are rate limited per user/IP; expensive endpoints have a stricter limit.
- Row-level security is **not** enabled: the application is the only database client and enforces ownership itself. If you expose the database to other clients (e.g. via Supabase), add RLS policies.

---

## Testing

```bash
npm run test          # unit + integration (embedded PostgreSQL in memory)
TEST_DATABASE_URL=postgres://user@localhost:5432/throwaway npm run test:integration   # against a server (drops its schema!)
npm run build && npm run test:e2e
```

- **Unit** (94): indicators against reference/hand-computed values, valuation formulas, risk statistics, portfolio ledger accounting, screener logic, CSV escaping and parsing, freshness labels, HTTP retry/backoff/validation, rate limiting, provider adapters with mocked HTTP, deterministic demo data, query validation, export policy, CSRF checks.
- **Integration** (16): migrations and seed, authentication and sessions, cross-user authorization, watchlist/portfolio persistence, alert engine (fires once, labels DEMO, ignores stale data), server-side screening, risk report.
- **End-to-end** (13): first-run setup, auth guards, every navigation route, keyboard search, watchlist persistence, portfolio entry and oversell rejection, screener and saved screens, valuation, alerts, CSV export, CSRF rejection, sign-out, mobile navigation.

---

## Known limitations

- **No real Indian market data is connected.** Live/delayed NSE and BSE data needs a licensed vendor. Alpha Vantage (BSE end-of-day) is the only market adapter and was not tested against the live API here.
- Demo indices are computed from fictional constituents and do not represent official index levels or methodologies. Exchange holidays are not modelled (weekdays only).
- Market session indicator uses the IST clock only; it does not know exchange holidays or special sessions.
- The economic calendar does not fetch release schedules; you add events yourself.
- Portfolio accounting uses weighted-average cost. FIFO lots, Indian capital-gains rules, taxes (unless entered as fees), symbol changes and mergers are not implemented. Corporate actions are not applied to portfolios automatically.
- Alerts are checked by an in-process scheduler that runs only while the server runs. Demo prices are static, so demo alerts fire at most once per quote.
- Embedded mode allows a single process on the data directory; run scripts with the server stopped.
- Resizing widgets is by size presets (small/medium/wide), not free-form.
- `start.ps1` was written for Windows PowerShell but could not be executed in the Linux build environment; `start.sh` was tested.

## Costs if you deploy publicly

Running locally costs nothing. A public deployment would need hosting, a managed PostgreSQL database, HTTPS, and — most importantly — market-data licences that permit public display, which exchanges and vendors charge for. Free API tiers have small quotas that can change without notice; keep `ALPHAVANTAGE_DAILY_LIMIT` and refresh intervals in line with your plan.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| “Database unavailable” (embedded) | Another process holds `./data/pglite`. Stop all OpenFinance processes, then `npm run dev`. |
| Embedded database corrupted | Stop the server, delete `data/`, run `npm run db:setup` (deletes accounts and records). |
| “Database reachable but not migrated” | `npm run db:setup` |
| PostgreSQL connection refused | Check the server is running and `DATABASE_URL` is correct; `npm run db:health`. With Docker: `docker compose ps`. |
| Port 3000 in use | `npx next dev -p 3001` |
| `npm install` fails on old Node | Install Node 20.9+ (22 LTS recommended). |
| Forgot password | Single-user local install: stop the server, delete `data/`, set up again — or in PostgreSQL mode delete the row from `users`. |
| Provider shows errors | Data Provider Status shows the exact message (keys redacted). Check the key, quota and symbols, then “Refresh now”. |
| Playwright cannot find a browser | `npx playwright install chromium` |
| PowerShell blocks the script | Use `powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1` |
