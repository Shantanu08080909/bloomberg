/** Indian-locale number formatting helpers. All return "—" for missing values. */

const DASH = "—";

const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function fmtNumber(v: number | null | undefined, dp = 2): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  if (dp === 2) return inr2.format(v);
  if (dp === 0) return inr0.format(v);
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(v);
}

export function fmtPrice(v: number | null | undefined): string {
  return fmtNumber(v, 2);
}

export function fmtINR(v: number | null | undefined, dp = 2): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return `₹${fmtNumber(v, dp)}`;
}

export function fmtSigned(v: number | null | undefined, dp = 2): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return `${v > 0 ? "+" : ""}${fmtNumber(v, dp)}`;
}

/** Percent from a value already in percent units (e.g. 1.25 → "+1.25%"). */
export function fmtPct(v: number | null | undefined, dp = 2, signed = true): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return `${signed && v > 0 ? "+" : ""}${v.toFixed(dp)}%`;
}

/** Percent from a decimal ratio (e.g. 0.0125 → "1.25%"). */
export function fmtRatioPct(v: number | null | undefined, dp = 2, signed = false): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return fmtPct(v * 100, dp, signed);
}

export function fmtMultiple(v: number | null | undefined, dp = 1): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return `${v.toFixed(dp)}x`;
}

/** Compact Indian units: 1.2 K, 3.4 L (lakh), 5.6 Cr (crore). */
export function fmtCompact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const a = Math.abs(v);
  if (a >= 1e7) return `${(v / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${(v / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)} K`;
  return fmtNumber(v, 0);
}

/** Market cap given in crore. */
export function fmtCrore(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(2)} L Cr`;
  return `₹${fmtNumber(v, 0)} Cr`;
}

export function changeClass(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return "text-muted";
  return v > 0 ? "text-up" : "text-down";
}
