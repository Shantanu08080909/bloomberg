import { XMLParser } from "fast-xml-parser";
import type { NewsProvider, NewsRecord, ProviderHealth } from "@/lib/market/types";
import { ProviderNotConfiguredError } from "@/lib/market/types";
import { ProviderHttpClient, type FetchLike } from "./http";
import { hashString } from "./demo/random";

/**
 * Generic RSS 2.0 / Atom adapter for feeds the operator configures in
 * NEWS_RSS_FEEDS. Only the headline, link, publication time and the short
 * description supplied by the feed itself are stored (truncated). Full
 * articles are never fetched. Check each publisher's terms before adding a
 * feed — this adapter does not grant any right to display its content.
 */
const MAX_SUMMARY = 280;

function text(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && "#text" in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)["#text"]);
  }
  return "";
}

export function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

function safeHttpUrl(value: string): string | null {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const asArray = <T,>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

export function parseFeed(xml: string, feedUrl: string): NewsRecord[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const doc = parser.parse(xml) as Record<string, unknown>;
  const out: NewsRecord[] = [];

  const rss = doc.rss as { channel?: Record<string, unknown> } | undefined;
  if (rss?.channel) {
    const publisher = text(rss.channel.title) || new URL(feedUrl).hostname;
    for (const item of asArray(rss.channel.item as Record<string, unknown>[] | undefined)) {
      const title = stripHtml(text(item.title));
      const link = safeHttpUrl(text(item.link));
      const published = new Date(text(item.pubDate));
      if (!title || Number.isNaN(published.getTime())) continue;
      out.push({
        externalId: String(hashString(text(item.guid) || link || title)),
        title,
        summary: truncate(stripHtml(text(item.description)), MAX_SUMMARY) || null,
        url: link,
        publisher,
        publishedAt: published,
        categories: asArray(item.category as unknown).map((c) => stripHtml(text(c))).filter(Boolean).slice(0, 5),
        tickers: [],
        isSample: false,
      });
    }
    return out;
  }

  const feed = doc.feed as Record<string, unknown> | undefined;
  if (feed) {
    const publisher = stripHtml(text(feed.title)) || new URL(feedUrl).hostname;
    for (const entry of asArray(feed.entry as Record<string, unknown>[] | undefined)) {
      const links = asArray(entry.link as Record<string, string> | Record<string, string>[] | undefined);
      const href = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate")?.["@_href"] ?? "";
      const title = stripHtml(text(entry.title));
      const published = new Date(text(entry.published) || text(entry.updated));
      if (!title || Number.isNaN(published.getTime())) continue;
      out.push({
        externalId: String(hashString(text(entry.id) || href || title)),
        title,
        summary: truncate(stripHtml(text(entry.summary)), MAX_SUMMARY) || null,
        url: safeHttpUrl(href),
        publisher,
        publishedAt: published,
        categories: [],
        tickers: [],
        isSample: false,
      });
    }
  }
  return out;
}

export class RssNewsProvider implements NewsProvider {
  readonly id = "rss";
  readonly name = "Configured RSS/Atom feeds";
  private readonly http: ProviderHttpClient;

  constructor(
    private readonly feeds: string[],
    fetchImpl?: FetchLike,
  ) {
    this.http = new ProviderHttpClient({ providerId: this.id, burst: 5, perSecond: 0.5, fetchImpl });
  }

  isConfigured() {
    return this.feeds.length > 0;
  }

  async fetchLatest(): Promise<NewsRecord[]> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError(this.id, "NEWS_RSS_FEEDS");
    const all: NewsRecord[] = [];
    const errors: string[] = [];
    for (const feed of this.feeds) {
      try {
        all.push(...parseFeed(await this.http.getText(feed), feed));
      } catch (err) {
        errors.push(`${feed}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (all.length === 0 && errors.length > 0) throw new Error(errors.join("; "));
    return all;
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      ok: this.isConfigured(),
      checkedAt: new Date(),
      message: this.isConfigured() ? `${this.feeds.length} feed(s) configured` : "No feeds configured (NEWS_RSS_FEEDS)",
      latencyMs: null,
    };
  }
}
