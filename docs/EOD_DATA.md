# NSE / BSE end-of-day data

OpenFinance Terminal can store real **end-of-day (EOD)** prices for NSE and BSE
equities and use them for charts, the screener, gainers/losers, breadth,
technical analysis and risk. It does **not** provide real-time or intraday
quotes. Until you import data, the terminal keeps running on its labelled
demo dataset.

- [What works today](#what-works-today)
- [Sources and file formats](#sources-and-file-formats)
- [Licensing and terms — read this first](#licensing-and-terms)
- [Setup](#setup)
- [Importing files manually](#importing-files-manually)
- [Historical backfill](#historical-backfill)
- [Daily update procedure](#daily-update-procedure)
- [How data is stored, labelled and protected](#how-data-is-stored-labelled-and-protected)
- [Limitations](#limitations)
- [Troubleshooting](#troubleshooting)

## What works today

Results from building and running the pipeline (October 2026). The build
environment had restricted network access, so NSE could not be tested live.

| Source | Result |
| --- | --- |
| **BSE UDiFF bhavcopy, automated download** | ✅ Worked. Sessions 13–22 Oct 2026 downloaded with a plain request and imported: ~4,500 equity rows per day, 0 rejected. A market holiday (20 Oct 2026) returned a web page instead of a file, which was detected and skipped. |
| **BSE UDiFF bhavcopy, manual import** | ✅ Worked with a real file (30 Sep 2026). |
| **NSE UDiFF / legacy bhavcopy, automated download** | ❌ Refused. On 22 Oct 2026 NSE's archive server answered this application's plain (non-browser) request with HTTP 403; earlier attempts got HTTP 503. This application will **not** imitate a browser, so it stops and tells you to download the file manually. Use manual import (or the TejHQ archive) for NSE. |
| **NSE bhavcopy, manual import** | ✅ Parser covers the UDiFF and legacy layouts. Tested with files built in the official column layout; no real NSE file could be downloaded here to test with. |
| **NSE index closing file (`ind_close_all_DDMMYYYY.csv`)** | ⚠️ Parser implemented from the documented column names, not tested on a real file (NSE unreachable). |
| **TejHQ archive (optional, third-party)** | ✅ Worked. NSE 2026 file (521,088 rows, 1 Jan – 21 Oct 2026) downloaded and imported in about 1.5 minutes, 0 rejected. |

## Sources and file formats

### NSE — All Reports page

`https://www.nseindia.com/all-reports` (Equities → "CM - UDiFF Common Bhavcopy Final (zip)").

| Period | File | Layout |
| --- | --- | --- |
| From 8 Jul 2024 | `BhavCopy_NSE_CM_0_0_0_YYYYMMDD_F_0000.csv.zip` at `https://nsearchives.nseindia.com/content/cm/` | **UDiFF Common Bhavcopy** (SEBI CMTS): `TradDt, BizDt, Sgmt, Src, FinInstrmTp, FinInstrmId, ISIN, TckrSymb, SctySrs, …, FinInstrmNm, OpnPric, HghPric, LwPric, ClsPric, LastPric, PrvsClsgPric, …, TtlTradgVol, TtlTrfVal, TtlNbOfTxsExctd, …` |
| Before 8 Jul 2024 | `cmDDMMMYYYYbhav.csv.zip` at `https://archives.nseindia.com/content/historical/EQUITIES/YYYY/MON/` | Legacy: `SYMBOL, SERIES, OPEN, HIGH, LOW, CLOSE, LAST, PREVCLOSE, TOTTRDQTY, TOTTRDVAL, TIMESTAMP, TOTALTRADES, ISIN` (dates like `13-JUL-2020` or `13-Jul-20`) |
| Indices | `ind_close_all_DDMMYYYY.csv` at `https://nsearchives.nseindia.com/content/indices/` | `Index Name, Index Date, Open/High/Low/Closing Index Value, Points Change, Change(%), Volume, Turnover (Rs. Cr.), P/E, P/B, Div Yield` |

Imported NSE series by default: `EQ, BE, BZ, SM, ST, SZ` (main board, trade-for-trade, SME).

### BSE — Bhavcopy page

`https://www.bseindia.com/markets/MarketInfo/BhavCopy` (Equity → "Equity Bhavcopy (UDiFF)").

| Period | File | Layout |
| --- | --- | --- |
| From 8 Jul 2024 | `BhavCopy_BSE_CM_0_0_0_YYYYMMDD_F_0000.CSV` at `https://www.bseindia.com/download/BhavCopy/Equity/` | Same UDiFF Common Bhavcopy layout as NSE, `Src = BSE`; `FinInstrmId` is the BSE scrip code, `SctySrs` the BSE group |
| Before 8 Jul 2024 | `EQ_ISINCODE_DDMMYY` | **Not supported** — legacy files identify securities by scrip code with no reliable mapping to today's tickers |

Imported BSE groups by default: `A, B, T, X, XT, M, MT, Z, ZP`. Debt (`F`),
government securities (`G`) and other non-equity groups are excluded.

The file locations above are the ones the exchanges publish. If they change,
override them with `EOD_NSE_UDIFF_URL`, `EOD_NSE_LEGACY_URL`,
`EOD_NSE_INDEX_URL` and `EOD_BSE_UDIFF_URL` (see `.env.example`).

### TejHQ Indian Markets archive (optional)

`https://github.com/TejHQ/Tej-Bazaar`, data on HuggingFace
(`tejhq/indian-markets`) and `https://data.tejhq.dev`. Yearly Parquet files
(`nse/year=YYYY/nse_YYYY.parquet`, `bse/year=YYYY/bse_YYYY.parquet`) rebuilt
daily from the exchanges' bhavcopy files. NSE from 2010, BSE from July 2024.
Columns: `date, symbol, series, isin, name, open, high, low, close, last,
prev_close, volume, turnover, trades`. Only the raw (unadjusted) bhavcopy
tree is imported.

## Licensing and terms

**This application does not grant you any right to use exchange data.** You are
responsible for using it in line with the exchanges' terms. Findings:

- **NSE and BSE** publish bhavcopy files openly on their websites, but making
  files viewable is not the same as permitting redistribution or commercial
  use, and I could not read and verify the exchanges' current terms of use
  from the build environment. Treat imported data as **personal, local use
  only** unless you have confirmed otherwise or hold a data licence. Index
  values belong to **NSE Indices Ltd** (NIFTY) and **Asia Index Pvt Ltd**
  (BSE/SENSEX indices).
- **TejHQ / tej-bazaar**:
  - The code is MIT-licensed (verified in the repository's `LICENSE`).
  - The dataset card also declares `license: mit` and says bhavcopy is
    "Public, free, redistributable" and that "redistribution as cleaned
    parquet is permitted". It cites no exchange terms to support that, and it
    adds: "Always verify exchange terms before commercial use." The MIT
    licence covers TejHQ's own work; it cannot grant rights the exchanges
    have not granted.
  - Collection method (from the repository source): the bhavcopy fetchers
    send browser-like User-Agent and Referer headers. The corporate-actions
    fetcher uses `curl_cffi` Chrome TLS impersonation and an NSE cookie
    warm-up. None of that code is used here.
  - Attribution: imported rows are recorded with format `tej_parquet`, the
    source URL and the label "TejHQ archive (third-party)" in provenance.
- **Consequences in this app**: automated downloads and the TejHQ archive are
  **off by default**. CSV export of imported exchange data is **blocked**
  (`EOD_EXPORT_ALLOWED=false`). Nothing is committed to the repository or
  shared from your machine.

What the downloader will not do: pre-load cookies, imitate a browser's
User-Agent, send a fake Referer, impersonate TLS fingerprints, use proxies,
retry around HTTP 401/403, or call the exchanges' undocumented `/api/`
endpoints. It requests only the published report files, at most one every
`EOD_MIN_INTERVAL_SECONDS` (default 3 s), with the User-Agent
`OpenFinanceTerminal/1.0 (personal end-of-day import; …)`.

## Setup

**Quickest (personal use):** `bash scripts/real-data.sh` stops the server, enables the
settings below, loads the current year from the TejHQ archive (NSE and BSE), downloads
the latest official files, then builds and starts the app (about 5 minutes).

Nothing is needed for manual import. To enable automated downloads and/or
the archive, add to `.env.local` and restart:

```ini
MARKET_DATA_SOURCE=auto        # use imported data when present (default)
EOD_DOWNLOAD_ENABLED=true      # only after reviewing the exchanges' terms
EOD_EXCHANGES=NSE,BSE
EOD_PUBLISH_AFTER_IST=19:00    # don't look for today's files before this
TEJ_ARCHIVE_ENABLED=true       # optional third-party archive
```

> Existing installs: if your `.env.local` was copied from an older
> `.env.example` it contains `MARKET_DATA_SOURCE=demo`, which forces demo mode.
> Change it to `auto`.

The command-line tool opens the database directly. With the default embedded
database, **stop the web server before running `npm run eod`** (only one
process can open `./data/pglite`). With `DATABASE_URL` (PostgreSQL server)
both can run at once.

## Importing files manually

Works with or without `EOD_DOWNLOAD_ENABLED`.

**In the app:** Data Provider Status → *End-of-day market data* → **Choose files…**
Accepts `.csv`, `.zip` (one or more CSVs inside) and TejHQ `.parquet`, up to
250 MB each and 40 files at a time. Only the owner account (the first account
created) can import.

**Command line:**

```bash
npm run eod -- import ~/Downloads/BhavCopy_NSE_CM_0_0_0_20261021_F_0000.csv.zip
npm run eod -- import ~/Downloads/bhavcopies/          # a whole folder
npm run eod -- import nse_2025.parquet                   # TejHQ archive file
npm run eod -- status
```

The file layout is detected from its header, not its name (TejHQ parquet
files must be named `nse_*.parquet` or `bse_*.parquet`).

## Historical backfill

Choose one or combine them; official files always win over the archive.

1. **TejHQ archive (fastest, NSE back to 2010)** — `TEJ_ARCHIVE_ENABLED=true`:
   ```bash
   npm run eod -- tej --exchange NSE --year 2025
   npm run eod -- tej --exchange NSE --year 2026
   npm run eod -- tej --exchange BSE --year 2026
   ```
   About 15–17 MB and 1–2 minutes per exchange-year. Several years make a
   large database (NSE is roughly 600,000 bars per year).
2. **Official files, automated** — `EOD_DOWNLOAD_ENABLED=true`:
   ```bash
   npm run eod -- backfill --exchange BSE --from 2026-08-01 --to 2026-09-30
   npm run eod -- backfill --exchange both --from 2026-10-01 --to 2026-10-21
   ```
   Up to `EOD_MAX_DAYS_PER_RUN` (default 60) trading days per run; already
   imported sessions are skipped, so you can re-run or split ranges freely.
   BSE automated backfill starts at 8 Jul 2024.
3. **Official files, manual** — download from the report pages and import the
   folder as above.

Backfilled and archive data is labelled **HISTORICAL**.

## Daily update procedure

**Automatic** (downloads enabled, server running): the built-in scheduler
checks once a day after `EOD_PUBLISH_AFTER_IST` (19:00 IST) and imports every
session since the last one it has, for each exchange in `EOD_EXCHANGES`.
Holidays are recognised (no file or a web page instead of a file) and simply
skipped. The result is shown on Data Provider Status.

**Manual, in the app:** Data Provider Status → **Update now**.

**Manual, command line** (server stopped when using the embedded database):

```bash
npm run eod -- update
```

**Without automated downloads:** after 19:00 IST, download the day's UDiFF
bhavcopy from the NSE All Reports page and the BSE Bhavcopy page, then
import them (in the app or with `npm run eod -- import`).

If NSE refuses automated access (HTTP 403), the update stops for NSE with a
message; BSE continues. Use the manual procedure for NSE.

## How data is stored, labelled and protected

- **Storage**: `instruments` (one per exchange + symbol, with ISIN, BSE scrip
  code, series), `price_bars` (OHLCV, previous close, turnover, trades,
  `import_id`, `origin`), `quotes` (latest session per instrument),
  `technical_snapshots` (SMA 50/200, RSI 14, 30-day volatility, 52-week range,
  1-year return for the screener) and `import_files` (provenance).
- **Idempotent**: bars are keyed by (instrument, source, date) and upserted;
  a file whose SHA-256 was imported before is skipped ("Re-process
  duplicates" / `--force` re-parses without creating duplicates).
- **Precedence**: a bar written from an official exchange file is never
  overwritten by the TejHQ archive.
- **Validation**: header check per format; rows with missing or non-positive
  prices, high below open/close/low, low above open/close/high, or
  non-integer volume are rejected with a reason; rows with zero volume (no
  trades) and non-equity series are skipped; one row per symbol per day
  (preferred series wins).
- **Normalisation**: symbols upper-cased and trimmed; the ISIN links NSE and
  BSE listings of the same company; a new symbol with the ISIN of a stock
  that stopped trading is treated as a rename and keeps its price history.
- **Provenance**: every import records file name, SHA-256, source URL (when
  downloaded), format, exchange, origin (official/archive), mode
  (daily/manual/backfill/archive), sessions covered, rows accepted/rejected,
  bars written, status, message, user and time. Every bar points to its
  import. The security page shows the latest bar's source; Data Explorer
  has an *Import history* dataset.
- **Labels**:
  - **END OF DAY**: the latest bar came from a daily or manual import of an
    official file.
  - **STALE**: an END OF DAY quote older than `STALE_AFTER_HOURS_EOD`
    (96 h by default).
  - **HISTORICAL**: from a backfill or the archive, i.e. not a current
    daily feed; this label never turns stale.
  - **DEMO**: the generated demo data.
  - **DELAYED/LIVE** stay reserved for providers that offer them.
  - The header shows "mixed" when a view combines labels.
- **Quote time**: the exchange files give a trade date only; quotes are
  stamped 15:30 IST (market close) on that date.

## Limitations

- End of day only; no intraday, no real-time.
- Prices are **as traded** (not adjusted for splits, bonuses or dividends);
  charts show a jump on a split date. The exchange's previous close (which is
  adjusted) is used for the daily change.
- Exchange files contain no market capitalisation, sectors, fundamentals,
  financial statements or corporate actions. Those screens show
  "unavailable", the screener switches to price and technical columns, and
  the heatmap is sized by traded value and grouped by series.
- No index constituent lists: market breadth is computed across all of an
  exchange's equities in the latest session.
- ETFs cannot be distinguished from equities in the bhavcopy; all are stored
  as EQUITY.
- Exchange holidays are not modelled; days without a file are skipped.
- BSE files before July 2024 are not supported.
- NSE automated download could not be tested from the build environment and
  may be refused on your machine; manual import is the dependable route.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Still showing demo data after an import | Check `MARKET_DATA_SOURCE` in `.env.local` is `auto` or `eod`, then reload. |
| `npm run eod` says the database is in use | Stop the web server (embedded database allows one process). |
| "received an HTML page, not a CSV file" | That day had no file (holiday/weekend) or the exchange showed an error page. Nothing was imported. |
| "The exchange refused automated access (HTTP 403)" | Download that file in your browser and import it manually. |
| "unrecognised file layout" | The file isn't a supported bhavcopy (e.g. a derivatives or SLB file). Use the CM / equity UDiFF bhavcopy. |
| Import shows rows rejected | The import history row lists the count; `npm run eod -- import` prints the first reasons. Valid rows are still imported. |
| An import is stuck in "running" | The process stopped mid-import. It is marked as interrupted 30 minutes later; import the file again (idempotent). |
