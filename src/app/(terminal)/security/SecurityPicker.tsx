"use client";

import { useRouter } from "next/navigation";
import { InstrumentPicker } from "@/components/InstrumentPicker";
import { securityHref } from "@/lib/dto";

export function SecurityPicker() {
  const router = useRouter();
  return <InstrumentPicker value={null} onChange={(v) => v && router.push(securityHref(v.exchange, v.symbol))} autoFocus placeholder="Type a symbol, company name or ISIN…" />;
}
