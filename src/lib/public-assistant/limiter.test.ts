import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { getDurableRequestLimiter, parseDurableLimiterDecision } from "./limiter";

describe("durable request limiter adapter", () => {
  it("provides the launch limiter and returns an audited decision", async () => {
    const limiter = getDurableRequestLimiter();
    const request = { headers: new Headers({ "x-forwarded-for": "198.51.100.42" }) } as NextRequest;

    await expect(limiter?.consume({ route: "public_assistant", request })).resolves.toMatchObject({
      allowed: true,
      retryAfterSeconds: null,
      decisionId: expect.any(String),
    });
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
