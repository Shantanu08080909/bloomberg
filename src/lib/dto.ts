import type { InstrumentWithQuote } from "@/lib/services/market";
import type { DisplayStatus } from "@/lib/market/types";

/** Serializable instrument + quote row passed from server to client components. */
export interface QuoteDTO {
  id: number;
  symbol: string;
  exchange: string;
  name: string;
  type: string;
  sector: string | null;
  price: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  high: number | null;
  low: number | null;
  asOf: string | null;
  status: DisplayStatus;
}

export function toQuoteDTO(i: InstrumentWithQuote): QuoteDTO {
  return {
    id: i.id,
    symbol: i.symbol,
    exchange: i.exchange,
    name: i.name,
    type: i.instrumentType,
    sector: i.sector,
    price: i.quote?.price ?? null,
    change: i.quote?.change ?? null,
    changePct: i.quote?.changePct ?? null,
    volume: i.quote?.volume ?? null,
    high: i.quote?.high ?? null,
    low: i.quote?.low ?? null,
    asOf: i.quote?.asOf?.toISOString() ?? null,
    status: i.displayStatus,
  };
}

export function securityHref(exchange: string, symbol: string) {
  return `/security/${encodeURIComponent(exchange)}/${encodeURIComponent(symbol)}`;
}
