/**
 * Sources evaluated for this project and their honest integration status.
 * "Integrated" means an adapter exists in this codebase; it does not mean it
 * has been verified against the live service.
 */
export interface SourceEvaluation {
  name: string;
  scope: string;
  status: "integrated" | "demo" | "not-integrated";
  adapterId?: string;
  notes: string;
  link: string;
}

export const SOURCE_CATALOG: SourceEvaluation[] = [
  {
    name: "OpenFinance demo generator",
    scope: "Instruments, prices, indices, fundamentals, statements, corporate actions, news, economics",
    status: "demo",
    adapterId: "demo",
    notes: "Deterministic synthetic data about fictional companies. Always labelled DEMO. Never real prices.",
    link: "/help#demo-data",
  },
  {
    name: "NSE — UDiFF Common Bhavcopy (equity, end of day)",
    scope: "Daily OHLCV, prev close, volume, turnover and trades for every NSE cash-market security. Files BhavCopy_NSE_CM_0_0_0_YYYYMMDD_F_0000.csv.zip from 8 Jul 2024; legacy cmDDMMMYYYYbhav.csv.zip before that; index closing values in ind_close_all_DDMMYYYY.csv",
    status: "integrated",
    adapterId: "eod",
    notes:
      "Parser and manual import implemented and tested against the official column layout. Automated download is optional (EOD_DOWNLOAD_ENABLED) and uses an honest User-Agent with no cookie warm-up, browser spoofing or TLS impersonation — NSE's servers may refuse such requests (403), in which case download the files from the All Reports page and import them. Not reachable from the build environment. Index data belongs to NSE Indices Ltd. Redistribution is not assumed; CSV export is off by default.",
    link: "https://www.nseindia.com/all-reports",
  },
  {
    name: "BSE — UDiFF Common Bhavcopy (equity, end of day)",
    scope: "Daily OHLCV, prev close, volume, turnover and trades for BSE equity groups. Files BhavCopy_BSE_CM_0_0_0_YYYYMMDD_F_0000.CSV from 8 Jul 2024",
    status: "integrated",
    adapterId: "eod",
    notes:
      "Downloaded and imported successfully from the build environment with a plain request. Non-trading days return a web page instead of a file, which is detected and not imported. Legacy (pre-July 2024) BSE files identify securities by scrip code only and are not supported. Redistribution is not assumed; CSV export is off by default.",
    link: "https://www.bseindia.com/markets/MarketInfo/BhavCopy",
  },
  {
    name: "TejHQ Indian Markets archive (tej-bazaar)",
    scope: "Third-party Parquet archive of NSE bhavcopy from 2010 and BSE from Jul 2024, rebuilt daily from exchange files",
    status: "integrated",
    adapterId: "eod",
    notes:
      "Optional (TEJ_ARCHIVE_ENABLED). Code is MIT; the dataset card declares MIT and states that bhavcopy is free to redistribute, but cites no exchange terms and itself advises verifying exchange terms before commercial use. Its collectors send browser-like headers, and its corporate-actions fetcher uses Chrome TLS impersonation and NSE cookie warm-up. Imported rows are labelled HISTORICAL, attributed to TejHQ, never overwrite official files, and are not exportable. Prices are as traded (the archive's adjusted-price tree is not imported).",
    link: "https://github.com/TejHQ/Tej-Bazaar",
  },
  {
    name: "Alpha Vantage",
    scope: "Quotes and daily bars for BSE listings (symbol.BSE)",
    status: "integrated",
    adapterId: "alphavantage",
    notes:
      "Requires a free or paid API key. Free tier allows very few requests per day. Fundamentals and corporate actions are not mapped. Not verified against the live service from the build environment.",
    link: "https://www.alphavantage.co/documentation/",
  },
  {
    name: "FRED — Federal Reserve Bank of St. Louis",
    scope: "US macro series and selected international series (e.g. DEXINUS)",
    status: "integrated",
    adapterId: "fred",
    notes:
      "Requires a free API key. Subject to the FRED API Terms of Use; some series are third-party copyrighted. Not verified against the live service from the build environment.",
    link: "https://fred.stlouisfed.org/docs/api/fred/",
  },
  {
    name: "Reserve Bank of India — DBIE",
    scope: "Policy rates, money supply, FX reserves, yields",
    status: "not-integrated",
    notes:
      "No documented, stable public API was identified. Download series from the DBIE portal yourself and use Data Explorer → Import CSV to load them as user-supplied data.",
    link: "https://data.rbi.org.in",
  },
  {
    name: "Ministry of Statistics (MoSPI)",
    scope: "CPI, IIP, GDP",
    status: "not-integrated",
    notes:
      "Official releases are published on the MoSPI website. API availability and terms were not verified; use CSV import for manually downloaded releases.",
    link: "https://www.mospi.gov.in",
  },
  {
    name: "SEBI",
    scope: "Circulars, orders and publications",
    status: "not-integrated",
    notes: "Publications are on the SEBI website. If SEBI provides an RSS feed you are permitted to use, add it to NEWS_RSS_FEEDS.",
    link: "https://www.sebi.gov.in",
  },
  {
    name: "RSS / Atom feeds",
    scope: "Headlines and short summaries from feeds you configure",
    status: "integrated",
    adapterId: "rss",
    notes:
      "Stores only headline, link, time and the feed's own short description. You are responsible for confirming each publisher permits this use.",
    link: "/help#news",
  },
];
