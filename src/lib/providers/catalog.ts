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
    name: "National Stock Exchange of India (NSE)",
    scope: "Real-time, delayed and end-of-day market data",
    status: "not-integrated",
    notes:
      "Exchange market data is distributed under licence (NSE's data products and authorised vendors). No free public API with redistribution rights was identified, and automated scraping of the exchange website is not used. Integrate through a licensed vendor whose terms permit your use.",
    link: "https://www.nseindia.com",
  },
  {
    name: "BSE Ltd",
    scope: "Real-time, delayed and end-of-day market data, corporate announcements",
    status: "not-integrated",
    notes:
      "BSE market data feeds are licensed products. The public website is not used as an API. Connect a licensed vendor or use the Alpha Vantage adapter for BSE end-of-day data if its terms fit your use.",
    link: "https://www.bseindia.com",
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
