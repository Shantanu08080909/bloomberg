import type {
  EconomicDataProvider,
  Exchange,
  MarketDataProvider,
  NewsProvider,
  ProviderHealth,
} from "@/lib/market/types";
import { generateDemoDataset, listingKey } from "./generator";

const health = async (): Promise<ProviderHealth> => ({
  ok: true,
  checkedAt: new Date(),
  message: "Deterministic demo data generated locally. Not real market data.",
  latencyMs: 0,
});

export class DemoMarketProvider implements MarketDataProvider {
  readonly id = "demo";
  readonly name = "OpenFinance Demo Data";
  readonly defaultStatus = "demo" as const;
  readonly capabilities = {
    search: true,
    metadata: true,
    quotes: true,
    bars: true,
    indices: true,
    fundamentals: true,
    statements: true,
    corporateActions: true,
  };

  isConfigured() {
    return true;
  }

  private get data() {
    return generateDemoDataset();
  }

  async searchInstruments(query: string) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return this.data.instruments.filter(
      (i) => i.symbol.toLowerCase().includes(q) || i.name.toLowerCase().includes(q),
    );
  }

  async getInstrument(symbol: string, exchange: Exchange) {
    return this.data.instruments.find((i) => i.symbol === symbol && i.exchange === exchange) ?? null;
  }

  async getQuotes(refs: { symbol: string; exchange: Exchange }[]) {
    const keys = new Set(refs.map((r) => listingKey(r.exchange, r.symbol)));
    return this.data.quotes.filter((q) => keys.has(listingKey(q.exchange, q.symbol)));
  }

  async getBars(symbol: string, exchange: Exchange, from: string, to: string) {
    return (this.data.bars.get(listingKey(exchange, symbol)) ?? []).filter(
      (b) => b.date >= from && b.date <= to,
    );
  }

  async getIndices() {
    return this.data.indices;
  }

  async getFundamentals(symbol: string, exchange: Exchange) {
    return this.data.fundamentals.find((f) => f.symbol === symbol && f.exchange === exchange) ?? null;
  }

  async getFinancialStatements(symbol: string, exchange: Exchange) {
    return this.data.statements.filter((s) => s.symbol === symbol && s.exchange === exchange);
  }

  async getCorporateActions(symbol: string, exchange: Exchange) {
    return this.data.corporateActions.filter((a) => a.symbol === symbol && a.exchange === exchange);
  }

  healthCheck = health;
}

export class DemoNewsProvider implements NewsProvider {
  readonly id = "demo";
  readonly name = "OpenFinance Sample News";
  isConfigured() {
    return true;
  }
  async fetchLatest() {
    return generateDemoDataset().news;
  }
  healthCheck = health;
}

export class DemoEconomicProvider implements EconomicDataProvider {
  readonly id = "demo";
  readonly name = "OpenFinance Demo Economics";
  readonly defaultStatus = "demo" as const;
  isConfigured() {
    return true;
  }
  async fetchSeries() {
    return generateDemoDataset().economic;
  }
  healthCheck = health;
}
