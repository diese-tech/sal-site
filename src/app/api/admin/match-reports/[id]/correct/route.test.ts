import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createMatchReportCorrectionHandler } from "./route";

const reportId = "01a122ab-0304-4506-8708-091011121314";
const routeContext = { params: Promise.resolve({ id: reportId }) };

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

const body = {
  games,
  expectedRevision: 1,
  correctionKey: "correction-1",
  reason: "Scoreboard kills were misread.",
};

const applied = {
  code: "applied",
  reportId,
  matchId: "match-1",
  finalStatus: "done",
  applied: true,
  homeScore: 1,
  awayScore: 0,
  totalGames: 1,
  revision: 2,
};

function request(payload: unknown) {
  return new NextRequest(
    `https://sal.example/api/admin/match-reports/${reportId}/correct`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

describe("POST /api/admin/match-reports/[id]/correct", () => {
  it("rejects callers without an admin session before invoking the database", async () => {
    const correctMatchReport = vi.fn();
    const handler = createMatchReportCorrectionHandler({
      getSession: () => null,
      correctMatchReport,
      revalidateLeagueData: vi.fn(),
    });

    const response = await handler(request(body), routeContext);

    expect(response.status).toBe(401);
    expect(correctMatchReport).not.toHaveBeenCalled();
  });

  it("passes the revision, key, and reason through to the correction RPC", async () => {
    const correctMatchReport = vi.fn().mockResolvedValue(applied);
    const revalidateLeagueData = vi.fn();
    const handler = createMatchReportCorrectionHandler({
      getSession: () => ({ discordId: "admin-1" }),
      correctMatchReport,
      revalidateLeagueData,
    });

    const response = await handler(request(body), routeContext);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      applied: true,
      code: "applied",
      homeScore: 1,
      awayScore: 0,
      totalGames: 1,
      revision: 2,
    });
    expect(correctMatchReport).toHaveBeenCalledWith({
      reportId,
      actorDiscordId: "admin-1",
      expectedRevision: 1,
      correctionKey: "correction-1",
      reason: "Scoreboard kills were misread.",
      games,
    });
    expect(revalidateLeagueData).toHaveBeenCalledTimes(1);
  });

  it("reports a replayed correction key as not applied", async () => {
    // The database returns the recorded receipt here and writes nothing, so a
    // plain success would claim a save that did not happen.
    const handler = createMatchReportCorrectionHandler({
      getSession: () => ({ discordId: "admin-1" }),
      correctMatchReport: vi.fn().mockResolvedValue({
        ...applied,
        code: "already_corrected",
        applied: false,
      }),
      revalidateLeagueData: vi.fn(),
    });

    const response = await handler(request(body), routeContext);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      applied: false,
      code: "already_corrected",
    });
  });

  it("requires a reason", async () => {
    const correctMatchReport = vi.fn();
    const handler = createMatchReportCorrectionHandler({
      getSession: () => ({ discordId: "admin-1" }),
      correctMatchReport,
      revalidateLeagueData: vi.fn(),
    });

    const response = await handler(request({ ...body, reason: "   " }), routeContext);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("reason"),
    });
    expect(correctMatchReport).not.toHaveBeenCalled();
  });

  it("requires every player to be linked before correcting", async () => {
    const correctMatchReport = vi.fn();
    const handler = createMatchReportCorrectionHandler({
      getSession: () => ({ discordId: "admin-1" }),
      correctMatchReport,
      revalidateLeagueData: vi.fn(),
    });

    const unlinked = structuredClone(games);
    // @ts-expect-error deliberately dropping the linked identity
    delete unlinked[0]!.players[0]!.playerId;

    const response = await handler(request({ ...body, games: unlinked }), routeContext);

    expect(response.status).toBe(400);
    expect(correctMatchReport).not.toHaveBeenCalled();
  });

  it("maps a superseded revision onto a conflict", async () => {
    const handler = createMatchReportCorrectionHandler({
      getSession: () => ({ discordId: "admin-1" }),
      correctMatchReport: vi.fn().mockRejectedValue(
        Object.assign(new Error("Match report changed since it was loaded."), { code: "55000" }),
      ),
      revalidateLeagueData: vi.fn(),
    });

    const response = await handler(request(body), routeContext);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("changed since it was loaded"),
    });
  });

  it("rejects an invalid report id before touching the database", async () => {
    const correctMatchReport = vi.fn();
    const handler = createMatchReportCorrectionHandler({
      getSession: () => ({ discordId: "admin-1" }),
      correctMatchReport,
      revalidateLeagueData: vi.fn(),
    });

    const response = await handler(request(body), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });

    expect(response.status).toBe(400);
    expect(correctMatchReport).not.toHaveBeenCalled();
  });
});
