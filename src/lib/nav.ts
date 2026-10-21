export interface NavItem {
  href: string;
  label: string;
  icon: string;
  keywords?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Markets",
    items: [
      { href: "/", label: "Dashboard", icon: "LayoutDashboard", keywords: "home overview" },
      { href: "/markets", label: "Indian Markets", icon: "Landmark", keywords: "nse bse indices heatmap breadth" },
      { href: "/explorer", label: "Stock Explorer", icon: "Search", keywords: "securities browse" },
      { href: "/security", label: "Security Details", icon: "CandlestickChart", keywords: "quote chart instrument" },
      { href: "/screener", label: "Stock Screener", icon: "Filter", keywords: "filter scan" },
    ],
  },
  {
    label: "Research",
    items: [
      { href: "/research", label: "Company Research", icon: "Building2", keywords: "financial statements fundamentals peers" },
      { href: "/technical", label: "Technical Analysis", icon: "Activity", keywords: "indicators rsi macd sma bollinger" },
      { href: "/valuation", label: "Valuation Lab", icon: "Calculator", keywords: "dcf wacc ddm sip cagr" },
      { href: "/corporate-actions", label: "Corporate Actions", icon: "CalendarClock", keywords: "dividends splits bonus" },
      { href: "/news", label: "Financial News", icon: "Newspaper", keywords: "headlines" },
      { href: "/notes", label: "Research Notes", icon: "NotebookPen", keywords: "journal" },
    ],
  },
  {
    label: "Portfolio",
    items: [
      { href: "/watchlists", label: "Watchlists", icon: "Star", keywords: "favourites" },
      { href: "/portfolio", label: "Portfolio Manager", icon: "Briefcase", keywords: "holdings transactions pnl" },
      { href: "/risk", label: "Risk Analytics", icon: "ShieldAlert", keywords: "beta sharpe volatility drawdown correlation" },
      { href: "/alerts", label: "Alerts", icon: "BellRing", keywords: "notifications price" },
    ],
  },
  {
    label: "Economy",
    items: [
      { href: "/economy", label: "Economic Dashboard", icon: "Globe2", keywords: "macro inflation gdp" },
      { href: "/calendar", label: "Economic Calendar", icon: "CalendarDays", keywords: "events releases" },
      { href: "/rates", label: "Yield and Rates", icon: "TrendingUp", keywords: "bonds yield curve repo fx" },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/data", label: "Data Explorer", icon: "Database", keywords: "datasets export csv import" },
      { href: "/workspace", label: "Workspace Builder", icon: "LayoutGrid", keywords: "layout widgets customise" },
      { href: "/providers", label: "Data Provider Status", icon: "PlugZap", keywords: "sources health refresh" },
      { href: "/settings", label: "Settings", icon: "Settings", keywords: "preferences account password" },
      { href: "/help", label: "Help & Documentation", icon: "LifeBuoy", keywords: "docs guide shortcuts" },
    ],
  },
];

export const NAV_ITEMS = NAV.flatMap((g) => g.items);
