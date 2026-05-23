import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkRateLimit, clearRateLimit } from "./rate-limit";

describe("checkRateLimit()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Reset state between tests by clearing any keys used
    clearRateLimit("test-key");
    clearRateLimit("key-a");
    clearRateLimit("key-b");
  });

  it("allows the first request", () => {
    const result = checkRateLimit("test-key");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("allows up to MAX_ATTEMPTS (10) requests", () => {
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit("test-key").allowed).toBe(true);
    }
  });

  it("blocks the 11th request", () => {
    for (let i = 0; i < 10; i++) checkRateLimit("test-key");
    const result = checkRateLimit("test-key");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("remaining decrements with each call", () => {
    expect(checkRateLimit("test-key").remaining).toBe(9);
    expect(checkRateLimit("test-key").remaining).toBe(8);
    expect(checkRateLimit("test-key").remaining).toBe(7);
  });

  it("remaining is 0 once limit is exceeded", () => {
    for (let i = 0; i < 12; i++) checkRateLimit("test-key");
    expect(checkRateLimit("test-key").remaining).toBe(0);
  });

  it("resets counter after the window expires (901 seconds)", () => {
    for (let i = 0; i < 10; i++) checkRateLimit("test-key");
    expect(checkRateLimit("test-key").allowed).toBe(false);

    vi.advanceTimersByTime(901 * 1000);

    const result = checkRateLimit("test-key");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("per-key isolation: exhausting key-a does not affect key-b", () => {
    for (let i = 0; i < 11; i++) checkRateLimit("key-a");
    expect(checkRateLimit("key-a").allowed).toBe(false);
    expect(checkRateLimit("key-b").allowed).toBe(true);
  });

  it("returns a resetAt timestamp in the future", () => {
    const now = Date.now();
    const { resetAt } = checkRateLimit("test-key");
    expect(resetAt).toBeGreaterThan(now);
  });
});

describe("clearRateLimit()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearRateLimit("test-key");
  });

  it("resets the counter so requests are allowed again", () => {
    for (let i = 0; i < 11; i++) checkRateLimit("test-key");
    expect(checkRateLimit("test-key").allowed).toBe(false);

    clearRateLimit("test-key");

    const result = checkRateLimit("test-key");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("clearing a non-existent key does not throw", () => {
    expect(() => clearRateLimit("never-used-key")).not.toThrow();
  });
});
