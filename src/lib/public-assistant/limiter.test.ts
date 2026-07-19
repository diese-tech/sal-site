import { describe, expect, it } from "vitest";
import { getDurableRequestLimiter, parseDurableLimiterDecision } from "./limiter";

describe("durable request limiter adapter", () => {
  it("remains unavailable until a durable implementation is installed", () => {
    expect(getDurableRequestLimiter()).toBeNull();
  });

  it("accepts only a complete audited limiter decision", () => {
    expect(
      parseDurableLimiterDecision({
        allowed: true,
        retryAfterSeconds: null,
        decisionId: "limit-decision-1",
      }),
    ).toEqual({ allowed: true, retryAfterSeconds: null, decisionId: "limit-decision-1" });
    expect(parseDurableLimiterDecision({ allowed: true })).toBeNull();
    expect(
      parseDurableLimiterDecision({ allowed: false, retryAfterSeconds: -1, decisionId: "limit-decision-2" }),
    ).toBeNull();
  });
});
