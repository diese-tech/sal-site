import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createMatchReportReviewHandler } from "./route";

const routeContext = { params: Promise.resolve({ id: "01a122ab-0304-4506-8708-091011121314" }) };
const games = [
  {
    gameNumber: 1,
    winningSide: "home" as const,
    players: Array.from({ length: 10 }, (_, index) => ({
      playerIgn: `Player ${index + 1}`,
      playerId: `player-${index + 1}`,
      side: index < 5 ? ("home" as const) : ("away" as const),
      won: index < 5,
      kills: index,
      deaths: 10 - index,
      assists: index + 2,
    })),
  },
];

function request(body: unknown) {
  return new NextRequest(
    "https://sal.example/api/admin/match-reports/01a122ab-0304-4506-8708-091011121314/submit",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/admin/match-reports/[id]/submit", () => {
  it("rejects callers without an admin session before invoking the database", async () => {
    const resolveMatchReport = vi.fn();
    const handler = createMatchReportReviewHandler({
      getSession: () => null,
      resolveMatchReport,
      revalidateLeagueData: vi.fn(),
    });

    const response = await handler(request({ games }), routeContext);

    expect(response.status).toBe(401);
    expect(resolveMatchReport).not.toHaveBeenCalled();
  });

  it("resolves the report through one atomic RPC and preserves the response shape", async () => {
    const resolveMatchReport = vi.fn().mockResolvedValue({
      code: "applied",
      reportId: "01a122ab-0304-4506-8708-091011121314",
      matchId: "match-1",
      finalStatus: "done",
      applied: true,
      homeScore: 1,
      awayScore: 0,
      totalGames: 1,
      outboxIds: ["outbox-1"],
    });
    const revalidateLeagueData = vi.fn();
    const handler = createMatchReportReviewHandler({
      getSession: () => ({ discordId: "admin-1" }),
      resolveMatchReport,
      revalidateLeagueData,
    });

    const response = await handler(request({ games }), routeContext);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      homeScore: 1,
      awayScore: 0,
      totalGames: 1,
    });
    expect(resolveMatchReport).toHaveBeenCalledTimes(1);
    expect(resolveMatchReport).toHaveBeenCalledWith({
      reportId: "01a122ab-0304-4506-8708-091011121314",
      actorDiscordId: "admin-1",
      games,
    });
    expect(revalidateLeagueData).toHaveBeenCalledTimes(1);
  });

  it("does not revalidate when the database transaction fails", async () => {
    const revalidateLeagueData = vi.fn();
    const handler = createMatchReportReviewHandler({
      getSession: () => ({ discordId: "admin-1" }),
      resolveMatchReport: vi.fn().mockRejectedValue(new Error("transaction rolled back")),
      revalidateLeagueData,
    });

    const response = await handler(request({ games }), routeContext);

    expect(response.status).toBe(500);
    expect(revalidateLeagueData).not.toHaveBeenCalled();
  });

  it("fails closed when the RPC returns an unexpected contract", async () => {
    const handler = createMatchReportReviewHandler({
      getSession: () => ({ discordId: "admin-1" }),
      resolveMatchReport: vi.fn().mockResolvedValue({ homeScore: 1 }),
      revalidateLeagueData: vi.fn(),
    });

    const response = await handler(request({ games }), routeContext);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Match report review returned an invalid database response.",
    });
  });
});
