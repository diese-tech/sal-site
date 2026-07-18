import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/assistant/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/assistant/questions", () => {
  it("fails closed without durable feature and sanitized-source gates", async () => {
    const response = await POST(
      request({
        question: "What does the current published rule say?",
        intent: "guidance",
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      kind: "assistant_unavailable",
      paidFallback: false,
      escalation: { available: false },
      reasons: ["durable_feature_flag_missing", "sanitized_sources_missing"],
    });
  });

  it("does not accept an unconfirmed official ruling request", async () => {
    const response = await POST(
      request({
        question: "Please make an official ruling on this case.",
        intent: "request_official_ruling",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      kind: "validation_error",
      fieldErrors: {
        rulingRequestConfirmed: ["Confirm the advisory notice before requesting an official ruling."],
      },
    });
  });
});
