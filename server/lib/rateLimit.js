/**
 * Sliding-window limiter keyed by client IP. Its job is to make guessing
 * a group code pointless: a few wrong joins and that address is out for
 * the block duration.
 */
export default class RateLimiter {
  constructor({ limit, windowMs, blockMs = 0, now = () => Date.now() } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.blockMs = blockMs;
    this._now = now;
    /** @type {Map<string, {hits: number[], blockedUntil: number}>} */
    this._buckets = new Map();
  }

  /**
   * Records an attempt. Returns `{ allowed, retryAfterMs }`.
   * Callers should only record *failed* attempts for secret-guessing
   * limits, so a household reconnecting repeatedly is never punished.
   */
  hit(key) {
    const now = this._now();
    let bucket = this._buckets.get(key);
    if (!bucket) {
      bucket = { hits: [], blockedUntil: 0 };
      this._buckets.set(key, bucket);
    }

    if (bucket.blockedUntil > now) {
      return { allowed: false, retryAfterMs: bucket.blockedUntil - now };
    }

    bucket.hits = bucket.hits.filter(t => now - t < this.windowMs);
    bucket.hits.push(now);

    if (bucket.hits.length > this.limit) {
      bucket.blockedUntil = now + this.blockMs;
      bucket.hits = [];
      return { allowed: false, retryAfterMs: this.blockMs };
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Clears a key after a legitimate success. */
  reset(key) {
    this._buckets.delete(key);
  }

  /** Drops buckets nothing has touched recently. Called on an interval. */
  sweep() {
    const now = this._now();
    for (const [key, bucket] of this._buckets) {
      const idle = bucket.hits.every(t => now - t >= this.windowMs);
      if (idle && bucket.blockedUntil <= now) this._buckets.delete(key);
    }
  }

  get size() {
    return this._buckets.size;
  }
}
