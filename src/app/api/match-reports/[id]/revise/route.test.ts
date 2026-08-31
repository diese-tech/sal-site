import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createReviseHostReviewHandler } from "./route";

const reportId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id: reportId }) };
const games = [{
  gameNumber: 1,
  winningSide: "home" as const,
  players: Array.from({ length: 10 }, (_, index) => ({
    ign: `Player${index + 1}`,
    playerId: `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`,
    side: index < 5 ? ("home" as const) : ("away" as const),
    kills: 5,
    deaths: 1,
    assists: 8,
  })),
}];

describe("host match-report revision", () => {
  it("revises through the host-scoped optimistic-concurrency RPC", async () => {
    const result = {
      code: "revised" as const,
      applied: true,
      reportId,
      revision: 3,
      status: "review" as const,
      games,
      diagnostics: {
        gameCount: 1,
        duplicateIgns: [],
        unlinkedIgns: [],
        ambiguousIgns: [],
        games: [],
      },
    };
    const reviseReview = vi.fn().mockResolvedValue(result);
    const handler = createReviseHostReviewHandler({
      canonicalSiteOrigin: "https://sal.example",
      getSession: () => ({
        matchReportId: reportId,
        hostDiscordId: "1234567890",
        expiresAt: Date.now() + 60_000,
      }),
      reviseReview,
    });
    const request = new NextRequest(
      `https://sal.example/api/match-reports/${reportId}/revise`,
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://sal.example" },
        body: JSON.stringify({ revision: 2, games }),
      },
    );

    const response = await handler(request, context);

    expect(response.status).toBe(200);
    expect(reviseReview).toHaveBeenCalledWith({
      matchReportId: reportId,
      hostDiscordId: "1234567890",
      expectedRevision: 2,
      games,
    });
    expect(await response.json()).toEqual({ ok: true, result });
  });

  it("does not persist an incomplete game", async () => {
    const reviseReview = vi.fn();
    const handler = createReviseHostReviewHandler({
      canonicalSiteOrigin: "https://sal.example",
      getSession: () => ({ matchReportId: reportId, hostDiscordId: "1234567890", expiresAt: Date.now() + 60_000 }),
      reviseReview,
    });
    const request = new NextRequest(`https://sal.example/api/match-reports/${reportId}/revise`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://sal.example" },
      body: JSON.stringify({ revision: 2, games: [{ ...games[0], players: games[0]!.players.slice(0, 9) }] }),
    });

    const response = await handler(request, context);

    expect(response.status).toBe(400);
    expect(reviseReview).not.toHaveBeenCalled();
  });
});
