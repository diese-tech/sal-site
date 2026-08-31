import { describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { createHostReviewSessionHandler } from "./route";

const reportId = "11111111-1111-4111-8111-111111111111";
const token = "a".repeat(43);
const context = { params: Promise.resolve({ id: reportId }) };

function requestFor(body: unknown, origin = "https://sal.example") {
  return new NextRequest(`${origin}/api/match-reports/${reportId}/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

describe("host match-report session exchange", () => {
  it("consumes the fragment token hash and sets a report-scoped session", async () => {
    const consumeToken = vi.fn().mockResolvedValue({
      matchReportId: reportId,
      hostDiscordId: "discord-host-1",
    });
    const setSession = vi.fn();
    const handler = createHostReviewSessionHandler({
      canonicalSiteOrigin: "https://sal.example",
      consumeToken,
      setSession,
    });

    const response = await handler(requestFor({ token }), context);

    expect(response.status).toBe(200);
    expect(consumeToken).toHaveBeenCalledWith(
      createHash("sha256").update(token).digest("hex"),
    );
    expect(setSession).toHaveBeenCalledWith(response, {
      matchReportId: reportId,
      hostDiscordId: "discord-host-1",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("returns the same private 404 for invalid, replayed, or cross-origin access", async () => {
    const consumeToken = vi.fn().mockResolvedValue(null);
    const handler = createHostReviewSessionHandler({
      canonicalSiteOrigin: "https://sal.example",
      consumeToken,
      setSession: vi.fn(),
    });

    const invalid = await handler(requestFor({ token }), context);
    const crossOrigin = await handler(
      new NextRequest(`https://sal.example/api/match-reports/${reportId}/session`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example" },
        body: JSON.stringify({ token }),
      }),
      context,
    );

    expect(invalid.status).toBe(404);
    expect(crossOrigin.status).toBe(404);
    expect(await invalid.json()).toEqual(await crossOrigin.json());
    expect(invalid.headers.get("cache-control")).toContain("no-store");
    expect(crossOrigin.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
