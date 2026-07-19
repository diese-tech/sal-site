import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "./route";

describe("POST /api/assistant/questions", () => {
  it("fails closed before accessing headers or parsing a body", async () => {
    let bodyRead = false;
    const request = {
      get headers() {
        throw new Error("headers must not be read while disabled");
      },
      get body() {
        bodyRead = true;
        throw new Error("body must not be parsed while disabled");
      },
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(503);
    expect(bodyRead).toBe(false);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      kind: "assistant_unavailable",
      paidFallback: false,
      escalation: { available: false },
      reasons: [
        "durable_feature_flag_missing",
        "sanitized_sources_missing",
        "privacy_guard_missing",
        "durable_rate_limiter_missing",
      ],
    });
  });
});
