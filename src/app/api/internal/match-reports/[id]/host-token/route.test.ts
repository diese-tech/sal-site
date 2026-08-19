import { createHash } from "crypto";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createIssueHostTokenHandler } from "./route";

const reportId = "11111111-1111-4111-8111-111111111111";
const rawToken = "t".repeat(43);
const context = { params: Promise.resolve({ id: reportId }) };

describe("internal match-report host token issuance", () => {
  it("stores only a token hash and returns a fragment review URL", async () => {
    const issueToken = vi.fn().mockResolvedValue(undefined);
    const handler = createIssueHostTokenHandler({
      canonicalSiteOrigin: "https://sal.example",
      internalToken: "internal-secret",
      generateToken: () => rawToken,
      now: () => new Date("2026-08-18T12:00:00.000Z"),
      issueToken,
    });
    const request = new NextRequest(
      `https://sal.example/api/internal/match-reports/${reportId}/host-token`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer internal-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ host_discord_id: "1234567890" }),
      },
    );

    const response = await handler(request, context);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(issueToken).toHaveBeenCalledWith({
      matchReportId: reportId,
      hostDiscordId: "1234567890",
      tokenHash: createHash("sha256").update(rawToken).digest("hex"),
      expiresAt: "2026-08-18T12:15:00.000Z",
    });
    expect(body).toEqual({
      review_url: `https://sal.example/match-reports/${reportId}/review#access=${rawToken}`,
      expires_at: "2026-08-18T12:15:00.000Z",
    });
    expect(JSON.stringify(issueToken.mock.calls)).not.toContain(rawToken);
  });

  it("does not mint or persist a token without the internal bearer secret", async () => {
    const issueToken = vi.fn();
    const generateToken = vi.fn(() => rawToken);
    const handler = createIssueHostTokenHandler({
      canonicalSiteOrigin: "https://sal.example",
      internalToken: "internal-secret",
      generateToken,
      now: () => new Date(),
      issueToken,
    });
    const request = new NextRequest(
      `https://sal.example/api/internal/match-reports/${reportId}/host-token`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ host_discord_id: "1234567890" }),
      },
    );

    const response = await handler(request, context);

    expect(response.status).toBe(401);
    expect(generateToken).not.toHaveBeenCalled();
    expect(issueToken).not.toHaveBeenCalled();
  });
});
