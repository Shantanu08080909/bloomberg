"use client";

import { useRouter } from "next/navigation";
import { InstrumentPicker } from "@/components/InstrumentPicker";

export function ResearchPicker({
  current,
  basePath = "/research",
}: {
  current: { id: number; symbol: string; exchange: string; name: string } | null;
  basePath?: string;
}) {
  const router = useRouter();
  return <InstrumentPicker value={current} onChange={(v) => router.push(v ? `${basePath}?id=${v.id}` : basePath)} types={["EQUITY"]} placeholder="Choose a company…" />;
}
