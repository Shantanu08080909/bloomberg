import type { z } from "zod";
import { ProviderError } from "@/lib/market/types";
import { TokenBucket } from "@/lib/rate-limit";

export interface FetchPolicy {
  timeoutMs: number;
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_POLICY: FetchPolicy = {
  timeoutMs: 10_000,
  retries: 2,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export function backoffDelay(attempt: number, policy: FetchPolicy, jitter = Math.random()): number {
  const exp = policy.baseDelayMs * 2 ** attempt;
  return Math.min(policy.maxDelayMs, Math.round(exp * (0.5 + jitter * 0.5)));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ProviderClientOptions {
  providerId: string;
  /** Requests allowed in a burst. */
  burst: number;
  /** Sustained requests per second. */
  perSecond: number;
  policy?: Partial<FetchPolicy>;
  fetchImpl?: FetchLike;
  sleepImpl?: (ms: number) => Promise<void>;
}

/**
 * Server-side HTTP client used by real provider adapters. It applies a
 * per-provider rate limit, a request timeout, bounded exponential-backoff
 * retries for transient failures, and runtime validation of the response.
 */
export class ProviderHttpClient {
  private readonly bucket: TokenBucket;
  private readonly policy: FetchPolicy;
  private readonly fetchImpl: FetchLike;
  private readonly sleepImpl: (ms: number) => Promise<void>;

  constructor(private readonly opts: ProviderClientOptions) {
    this.bucket = new TokenBucket(opts.burst, opts.perSecond);
    this.policy = { ...DEFAULT_POLICY, ...opts.policy };
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.sleepImpl = opts.sleepImpl ?? sleep;
  }

  async getJson<T>(url: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
    const text = await this.getText(url, init);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ProviderError("Response was not valid JSON", this.opts.providerId, false);
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new ProviderError(
        `Unexpected response shape: ${result.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
        this.opts.providerId,
        false,
      );
    }
    return result.data;
  }

  async getText(url: string, init?: RequestInit): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.policy.retries; attempt++) {
      const wait = this.bucket.waitTime();
      if (wait === Number.POSITIVE_INFINITY || wait > 60_000) {
        throw new ProviderError("Local rate limit for this provider reached", this.opts.providerId, true, 429);
      }
      if (wait > 0) await this.sleepImpl(wait);
      this.bucket.tryTake();
      try {
        const res = await this.fetchImpl(url, {
          ...init,
          headers: { Accept: "application/json, application/xml, text/xml, */*", ...init?.headers },
          signal: AbortSignal.timeout(this.policy.timeoutMs),
          cache: "no-store",
        });
        if (!res.ok) {
          const retryable = RETRYABLE_STATUS.has(res.status);
          const err = new ProviderError(`HTTP ${res.status}`, this.opts.providerId, retryable, res.status);
          if (!retryable) throw err;
          lastError = err;
        } else {
          return await res.text();
        }
      } catch (err) {
        if (err instanceof ProviderError && !err.retryable) throw err;
        lastError =
          err instanceof ProviderError
            ? err
            : new ProviderError(
                err instanceof Error && err.name === "TimeoutError"
                  ? `Request timed out after ${this.policy.timeoutMs} ms`
                  : `Network error: ${err instanceof Error ? err.message : String(err)}`,
                this.opts.providerId,
                true,
              );
      }
      if (attempt < this.policy.retries) await this.sleepImpl(backoffDelay(attempt, this.policy));
    }
    throw lastError instanceof Error
      ? lastError
      : new ProviderError("Request failed", this.opts.providerId, true);
  }
}

/** Remove credentials from URLs before they are logged or stored. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (/key|token|secret|password/i.test(key)) u.searchParams.set(key, "REDACTED");
    }
    return u.toString();
  } catch {
    return "[invalid url]";
  }
}
