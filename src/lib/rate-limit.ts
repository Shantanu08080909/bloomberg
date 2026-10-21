/** In-memory token-bucket rate limiter (per process). */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  private refill() {
    const t = this.now();
    const elapsed = (t - this.last) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    this.last = t;
  }

  tryTake(count = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  /** Milliseconds until `count` tokens are available. */
  waitTime(count = 1): number {
    this.refill();
    if (this.tokens >= count) return 0;
    if (this.refillPerSecond <= 0) return Number.POSITIVE_INFINITY;
    return Math.ceil(((count - this.tokens) / this.refillPerSecond) * 1000);
  }
}

export class KeyedRateLimiter {
  private buckets = new Map<string, TokenBucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): { allowed: boolean; retryAfterMs: number } {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size > 10_000) this.buckets.clear();
      bucket = new TokenBucket(this.capacity, this.refillPerSecond, this.now);
      this.buckets.set(key, bucket);
    }
    if (bucket.tryTake()) return { allowed: true, retryAfterMs: 0 };
    return { allowed: false, retryAfterMs: bucket.waitTime() };
  }
}

const g = globalThis as unknown as { __ofApiLimiter?: KeyedRateLimiter; __ofHeavyLimiter?: KeyedRateLimiter };

/** General API limiter: bursts of 120, ~10 requests/second sustained per client. */
export const apiLimiter = (g.__ofApiLimiter ??= new KeyedRateLimiter(120, 10));
/** Expensive operations (exports, provider refreshes, screener): 20 burst, 1 per 3 s. */
export const heavyLimiter = (g.__ofHeavyLimiter ??= new KeyedRateLimiter(20, 1 / 3));
