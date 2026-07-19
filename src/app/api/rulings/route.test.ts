import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "./route";

describe("POST /api/rulings", () => {
  it("fails closed before auth, headers, CSRF, or body access", async () => {
    let bodyRead = false;
    const request = {
      get headers() {
        throw new Error("headers must not be read while Release B/C is disabled");
      },
      get body() {
        bodyRead = true;
        throw new Error("body must not be parsed while Release B/C is disabled");
      },
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(503);
    expect(bodyRead).toBe(false);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      kind: "ruling_request_unavailable",
      code: "RULING_REQUESTS_DISABLED",
    });
  });
});
