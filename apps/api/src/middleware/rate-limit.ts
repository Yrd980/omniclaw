import type { MiddlewareHandler } from "hono";
import { ApiError } from "../errors";

export type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
};

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 100,
};

type WindowEntry = {
  timestamps: number[];
};

const windows = new Map<string, WindowEntry>();

const cleanup = (windowMs: number) => {
  const now = Date.now();
  for (const [key, entry] of windows.entries()) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
    if (entry.timestamps.length === 0) {
      windows.delete(key);
    }
  }
};

export const rateLimit = (config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG): MiddlewareHandler => {
  const { windowMs, maxRequests } = config;

  return async (c, next) => {
    const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
    const now = Date.now();

    let entry = windows.get(ip);
    if (!entry) {
      entry = { timestamps: [] };
      windows.set(ip, entry);
    }

    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= maxRequests) {
      const oldestInWindow = entry.timestamps[0];
      const retryAfter = Math.ceil((oldestInWindow + windowMs - now) / 1000);

      c.header("Retry-After", String(retryAfter));
      c.header("X-RateLimit-Limit", String(maxRequests));
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", String(Math.ceil((oldestInWindow + windowMs) / 1000)));

      throw new ApiError(429, "RATE_LIMITED", "Too many requests, please try again later", { retryAfter });
    }

    entry.timestamps.push(now);
    c.header("X-RateLimit-Limit", String(maxRequests));
    c.header("X-RateLimit-Remaining", String(maxRequests - entry.timestamps.length));
    c.header("X-RateLimit-Reset", String(Math.ceil((now + windowMs) / 1000)));

    if (Math.random() < 0.01) {
      cleanup(windowMs);
    }

    await next();
  };
};
