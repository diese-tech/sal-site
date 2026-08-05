import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { createScouterGameCorrectionHandler } from "./route";

const participants = Array.from({ length: 10 }, (_, index) => ({
  id: `participant-${index}`,
  side: index < 5 ? "order" : "chaos",
  rawIgn: `Player ${index}`,
  playerId: null,
  godId: null,
  role: null,
  playerLevel: null,
  kills: 0,
  deaths: 0,
  assists: 0,
  gpm: null,
  playerDamage: null,
  minionDamage: null,
  jungleDamage: null,
  structureDamage: null,
  damageTaken: null,
  damageMitigated: null,
  selfHealing: null,
  allyHealing: null,
  wardsPlaced: null,
}));

const body = {
  expectedRevision: 1,
  correctionKey: "correction-1",
  reason: "Correct OCR names before publication.",
  game: {
    smiteMatchId: "smite-1",
    gameMode: "Conquest",
    winningSide: "order",
    matchLengthSeconds: 1_800,
    participants,
  },
};

const context = { params: Promise.resolve({ gameId: "game-1" }) };

describe("PATCH /api/admin/scouters/games/[gameId]", () => {
  it("requires a Discord-backed admin session", async () => {
    for (const session of [null, { discordId: "password-admin" }]) {
      const handler = createScouterGameCorrectionHandler({
        getSession: () => session,
        correctGame: vi.fn(),
      });
      const response = await handler(
        new NextRequest("https://sal.example/api/admin/scouters/games/game-1", {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
        context,
      );

      expect([401, 403]).toContain(response.status);
    }
  });

  it("rejects partial participant updates before the database call", async () => {
    const correctGame = vi.fn();
    const handler = createScouterGameCorrectionHandler({
      getSession: () => ({ discordId: "admin-1" }),
      correctGame,
    });
    const response = await handler(
      new NextRequest("https://sal.example/api/admin/scouters/games/game-1", {
        method: "PATCH",
        body: JSON.stringify({
          ...body,
          game: { ...body.game, participants: participants.slice(0, 9) },
        }),
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(correctGame).not.toHaveBeenCalled();
  });

  it("forwards the complete correction and returns its new revision", async () => {
    const correctGame = vi.fn().mockResolvedValue({
      code: "corrected",
      applied: true,
      correctionId: "receipt-1",
      scouterGameId: "game-1",
      revision: 2,
    });
    const handler = createScouterGameCorrectionHandler({
      getSession: () => ({ discordId: "admin-1" }),
      correctGame,
    });
    const response = await handler(
      new NextRequest("https://sal.example/api/admin/scouters/games/game-1", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, revision: 2 });
    expect(correctGame).toHaveBeenCalledWith("game-1", "admin-1", body);
  });

  it("reports stale revisions as conflicts", async () => {
    const handler = createScouterGameCorrectionHandler({
      getSession: () => ({ discordId: "admin-1" }),
      correctGame: vi.fn().mockRejectedValue({ code: "40001" }),
    });
    const response = await handler(
      new NextRequest("https://sal.example/api/admin/scouters/games/game-1", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
      context,
    );

    expect(response.status).toBe(409);
  });
});
