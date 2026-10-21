import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader, StatusBadge } from "@/components/ui";
import { STATUS_DESCRIPTION } from "@/lib/market/freshness";
import { NAV } from "@/lib/nav";

export const metadata: Metadata = { title: "Help & Documentation" };

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 rounded-panel border border-line bg-panel p-4">
      <h2 className="mb-2 text-[14px] font-semibold text-fg">
        <a href={`#${id}`} className="hover:text-accent-strong">
          {title}
        </a>
      </h2>
      <div className="flex flex-col gap-2 text-[12.5px] leading-relaxed text-dim [&_code]:rounded [&_code]:bg-bg [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11.5px] [&_code]:text-fg [&_li]:ml-4 [&_li]:list-disc">
        {children}
      </div>
    </section>
  );
}

const TOC: [string, string][] = [
  ["getting-started", "Getting started"],
  ["demo-data", "Demo mode and data labels"],
  ["keyboard", "Search and keyboard shortcuts"],
  ["sections", "What each section does"],
  ["providers", "Connecting real data"],
  ["news", "News sources"],
  ["portfolio", "Portfolio accounting"],
  ["analytics", "Indicator and risk methods"],
  ["alerts", "Alerts and notifications"],
  ["security", "Accounts and security"],
  ["troubleshooting", "Troubleshooting"],
  ["disclaimer", "Disclaimer"],
];

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Help & Documentation" subtitle="How OpenFinance Terminal works, what its data labels mean, and how to connect real sources." />
      <div className="grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Help contents" className="h-fit rounded-panel border border-line bg-panel p-2 xl:sticky xl:top-16">
          <ul className="text-[12.5px]">
            {TOC.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded px-2 py-1 text-dim hover:bg-raised hover:text-fg">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col gap-3">
          <Section id="getting-started" title="Getting started">
            <p>OpenFinance Terminal runs entirely on your computer. On first launch it creates its database, loads demo data and asks you to create an owner account (there are no default credentials).</p>
            <ul>
              <li>
                Start with the <Link href="/" className="text-accent">Dashboard</Link>, or press <kbd>/</kbd> and type a symbol.
              </li>
              <li>Add securities to a watchlist from any security page, record paper trades in Portfolio Manager, and build your own layout in Workspace Builder.</li>
              <li>Everything you create (watchlists, portfolios, notes, alerts, layouts) is stored in the local database and scoped to your account.</li>
            </ul>
          </Section>

          <Section id="demo-data" title="Demo mode and data labels">
            <p>
              Without API keys, the terminal uses a <strong>deterministic demo dataset</strong>: about sixty <strong>fictional</strong> companies with NSE and BSE listings,
              three years of synthetic daily prices, fundamentals, financial statements, corporate actions, six demo index series, sample news and synthetic economic series.
              The same data is generated on every computer. ISINs start with <code>ZZDEMO</code> (not a real country code) and indices are labelled “(demo series)” — they
              are not NSE or BSE index values.
            </p>
            <p>Every price or dataset carries one of these labels; they are never silently mixed (a “mixed” marker appears when a view combines statuses):</p>
            <ul className="!ml-0 flex flex-col gap-1.5">
              {(["demo", "live", "delayed", "eod", "stale", "unavailable"] as const).map((s) => (
                <li key={s} className="!ml-0 flex list-none items-start gap-2">
                  <StatusBadge status={s} className="mt-0.5 shrink-0" />
                  <span>{STATUS_DESCRIPTION[s]}</span>
                </li>
              ))}
            </ul>
            <p>
              Demo data never turns into “live” or “stale”. Real data becomes STALE after a configurable age (<code>STALE_AFTER_MINUTES_LIVE</code>,{" "}
              <code>STALE_AFTER_MINUTES_DELAYED</code>, <code>STALE_AFTER_HOURS_EOD</code>). The demo calendar models weekdays only — exchange holidays are not modelled.
            </p>
          </Section>

          <Section id="keyboard" title="Search and keyboard shortcuts">
            <ul>
              <li>
                <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd> or <kbd>/</kbd> — open search (securities by symbol, name, ISIN or BSE code; pages; watchlists; recent searches).
              </li>
              <li>
                <kbd>↑</kbd> <kbd>↓</kbd> move through results, <kbd>Enter</kbd> opens, <kbd>Esc</kbd> closes.
              </li>
              <li>Table headers are buttons: click (or Enter) to sort; tables with a filter box search as you type.</li>
              <li>In Workspace Builder edit mode, focus a widget&apos;s grip handle, press Space, use arrow keys to move it, then Space to drop.</li>
              <li>The first Tab on any page reveals a “Skip to content” link.</li>
            </ul>
          </Section>

          <Section id="sections" title="What each section does">
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {NAV.flatMap((g) => g.items).map((i) => (
                <p key={i.href}>
                  <Link href={i.href} className="font-medium text-accent">
                    {i.label}
                  </Link>{" "}
                  <span className="text-muted">— {i.keywords}</span>
                </p>
              ))}
            </div>
          </Section>

          <Section id="providers" title="Connecting real data">
            <p>Real providers are configured with environment variables in <code>.env.local</code> (copy <code>.env.example</code>). Keys stay on the server; they are never sent to the browser.</p>
            <ul>
              <li>
                <strong>Alpha Vantage</strong> (quotes and daily bars for BSE listings): set <code>ALPHAVANTAGE_API_KEY</code>, list symbols in <code>ALPHAVANTAGE_SYMBOLS</code>, and set{" "}
                <code>MARKET_DATA_SOURCE=alphavantage</code>. The free tier allows very few requests per day; fundamentals, indices and corporate actions are not provided by this adapter and show as unavailable.
              </li>
              <li>
                <strong>FRED</strong> (US and selected international macro series): set <code>FRED_API_KEY</code> and optionally <code>FRED_SERIES</code>.
              </li>
              <li>
                <strong>RSS/Atom news</strong>: set <code>NEWS_RSS_FEEDS</code> to feeds you are permitted to use.
              </li>
              <li>
                <strong>RBI, MoSPI, NSE and BSE</strong>: no free, documented API with suitable rights was identified. Download official releases yourself and use{" "}
                <Link href="/data" className="text-accent">Data Explorer → Import CSV</Link>, or integrate a licensed vendor by adding an adapter that implements the provider interface in{" "}
                <code>src/lib/market/types.ts</code>.
              </li>
            </ul>
            <p>
              After changing configuration, restart the server and use <Link href="/providers" className="text-accent">Data Provider Status</Link> → Refresh now. Every refresh is logged
              with its outcome. Adapters apply request timeouts, bounded exponential-backoff retries, local rate limits and response validation.
            </p>
          </Section>

          <Section id="news" title="News sources">
            <p>
              With no feed configured you see a labelled <strong>sample</strong> set about fictional companies — never presented as current news. With feeds configured, only the headline,
              link, publication time and the short description supplied by the feed are stored; full articles are never fetched or copied. Follow the link to read the original.
            </p>
          </Section>

          <Section id="portfolio" title="Portfolio accounting">
            <ul>
              <li>Method: weighted-average cost per security. Fees are added to cost on buys and deducted from proceeds on sells.</li>
              <li>Realised P&amp;L = sell proceeds − fees − average cost × quantity sold. Unrealised P&amp;L uses the latest stored price and is hidden when any price is missing.</li>
              <li>Dividends are cash income (enter the total amount received). Splits and bonuses multiply quantity by the ratio and keep total cost unchanged.</li>
              <li>Overselling, invalid quantities/prices, future dates and edits that would break later sells are rejected.</li>
              <li>Performance uses a time-weighted return that neutralises contributions and withdrawals.</li>
              <li>Taxes, FIFO lot matching and holding-period rules for Indian capital gains are not implemented — do not use this for tax filing.</li>
            </ul>
          </Section>

          <Section id="analytics" title="Indicator and risk methods">
            <ul>
              <li>SMA, EMA (seeded with the SMA), RSI and ATR (Wilder smoothing), MACD (12/26/9 default), Bollinger Bands (population σ), rolling volatility (sample σ of log returns × √252).</li>
              <li>Insufficient history yields blank values, never estimates; zero denominators yield blanks.</li>
              <li>Risk uses simple daily returns on dates common to all series, 252 trading days per year, and a user-supplied annual risk-free rate (rf/252 per day).</li>
              <li>Beta = cov(asset, benchmark) / var(benchmark). Sharpe and Sortino are annualised. Stress windows are the benchmark&apos;s worst non-overlapping 20-day periods in the loaded history.</li>
              <li>All indicator and risk code is covered by unit tests. Historical measures describe the past and are not predictions.</li>
            </ul>
          </Section>

          <Section id="alerts" title="Alerts and notifications">
            <p>
              Alerts compare a threshold with the latest stored quote of the alert&apos;s instrument, using that quote&apos;s own timestamp. An alert fires at most once per quote and never on
              stale or missing data. Demo alerts are labelled DEMO.
            </p>
            <p>
              Background checks run only while the server is running and the scheduler is enabled; the Alerts page shows whether a recent heartbeat exists. Email is sent only if SMTP is
              configured and you enable it in Settings.
            </p>
          </Section>

          <Section id="security" title="Accounts and security">
            <ul>
              <li>Passwords are hashed with bcrypt. Sessions are random tokens; only their SHA-256 hash is stored. Cookies are HttpOnly and SameSite=Lax.</li>
              <li>Every user-owned record is filtered by the signed-in user on the server; IDs sent by the browser are never trusted on their own.</li>
              <li>State-changing requests from other sites are rejected; API routes are rate limited; queries are parameterised; CSV exports neutralise spreadsheet formulas.</li>
              <li>Only the first account can be created without configuration. Set <code>ALLOW_REGISTRATION=true</code> to let others register.</li>
            </ul>
          </Section>

          <Section id="troubleshooting" title="Troubleshooting">
            <ul>
              <li>
                “Database unavailable” in embedded mode: another process is using <code>./data/pglite</code>. Stop other OpenFinance processes (including <code>npm run db:*</code> scripts) and restart.
              </li>
              <li>
                Corrupted embedded database: stop the server, delete the <code>data</code> folder, run <code>npm run db:setup</code>. (This also deletes your accounts and records.)
              </li>
              <li>
                PostgreSQL mode: check <code>DATABASE_URL</code> and run <code>npm run db:health</code>.
              </li>
              <li>A provider shows errors: open Data Provider Status for the exact message (keys are redacted), check quotas and keys, then Refresh now.</li>
              <li>See README.md for installation and platform-specific notes.</li>
            </ul>
          </Section>

          <Section id="disclaimer" title="Disclaimer">
            <p>
              OpenFinance Terminal is an independent, original research tool. It is not affiliated with Bloomberg, NSE, BSE, SEBI, RBI or any data vendor, and does not use their proprietary
              data, software or branding. Nothing in it is investment, tax or legal advice. Calculators show the arithmetic consequences of your assumptions and do not guarantee returns.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
