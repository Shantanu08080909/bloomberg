import "server-only";
import { csvList, getConfig } from "@/lib/config";
import { AlphaVantageProvider } from "./alphavantage";
import { DemoEconomicProvider, DemoMarketProvider, DemoNewsProvider } from "./demo/provider";
import { FredProvider } from "./fred";
import { RssNewsProvider } from "./rss";

export function getProviders() {
  const c = getConfig();
  return {
    market: {
      demo: new DemoMarketProvider(),
      alphavantage: new AlphaVantageProvider(
        c.ALPHAVANTAGE_API_KEY,
        c.ALPHAVANTAGE_DATA_STATUS,
        c.ALPHAVANTAGE_DAILY_LIMIT,
      ),
    },
    news: {
      demo: new DemoNewsProvider(),
      rss: new RssNewsProvider(csvList(c.NEWS_RSS_FEEDS)),
    },
    economic: {
      demo: new DemoEconomicProvider(),
      fred: new FredProvider(c.FRED_API_KEY, csvList(c.FRED_SERIES)),
    },
  };
}
