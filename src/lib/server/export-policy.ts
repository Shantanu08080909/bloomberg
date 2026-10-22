import { ApiError } from "./api";

/**
 * Which sources' data may be exported to CSV. Demo and user-supplied data are
 * always exportable. Real providers default to NOT exportable because their
 * terms typically restrict redistribution; FRED allows download with
 * attribution, which the export includes.
 */
export const EXPORT_POLICY: Record<string, { allowed: boolean; attribution?: string; reason?: string }> = {
  demo: { allowed: true, attribution: "OpenFinance synthetic demo data — not real market data" },
  user: { allowed: true, attribution: "User-supplied data" },
  fred: { allowed: true, attribution: "Source: FRED, Federal Reserve Bank of St. Louis" },
  alphavantage: { allowed: false, reason: "Alpha Vantage data is not exportable from this application; check the provider's terms." },
  rss: { allowed: false, reason: "Third-party news content is not exportable." },
  eod: {
    allowed: process.env.EOD_EXPORT_ALLOWED === "true",
    attribution: "Source: NSE/BSE end-of-day files imported by the user (personal use)",
    reason: "Exchange end-of-day data is not exportable by default because redistribution rights are not assumed. Set EOD_EXPORT_ALLOWED=true only if your use is permitted.",
  },
};

export const MAX_EXPORT_ROWS = 10_000;

export function assertExportAllowed(sourceId: string) {
  const p = EXPORT_POLICY[sourceId];
  if (!p?.allowed) throw new ApiError(403, p?.reason ?? "Export is not permitted for this data source", "export_forbidden");
  return p;
}
