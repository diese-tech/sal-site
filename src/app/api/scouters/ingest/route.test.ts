import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { createScouterIngestHandler } from "./route";

function request(body: unknown, token?: string) {
  return new NextRequest("https://sal.example/api/scouters/ingest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const validPayload = {
  scoreboard_image_path: "scouters/match-1/game-1-scoreboard.png",
  details_image_path: "scouters/match-1/game-1-details.png",
  game_ordinal: 1,
  expected_smite_match_id: "smite-match-1",
  hosted_by_discord_id: "discord-host-1",
  season_id: "preseason2",
};

describe("POST /api/scouters/ingest", () => {
  it("rejects callers without the internal service token before OCR or writes", async () => {
    const extractFromStorage = vi.fn();
    const writeGame = vi.fn();
    const handler = createScouterIngestHandler({
      isAuthorized: () => false,
      extractFromStorage,
      writeGame,
      receiptUrl: vi.fn(),
    });

    const response = await handler(request({}));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
    expect(extractFromStorage).not.toHaveBeenCalled();
    expect(writeGame).not.toHaveBeenCalled();
  });

  it("rejects an invalid ingest payload before reading storage", async () => {
    const extractFromStorage = vi.fn();
    const writeGame = vi.fn();
    const handler = createScouterIngestHandler({
      isAuthorized: () => true,
      extractFromStorage,
      writeGame,
      receiptUrl: vi.fn(),
    });

    const response = await handler(request({ game_ordinal: 0 }, "internal-token"));

    expect(response.status).toBe(400);
    expect(extractFromStorage).not.toHaveBeenCalled();
    expect(writeGame).not.toHaveBeenCalled();
  });

  it("surfaces the raw model response when OCR is structurally invalid and performs no write", async () => {
    const extractionError = Object.assign(new Error("OCR response was not valid scouter data."), {
      rawResponse: "not-json",
    });
    const writeGame = vi.fn();
    const handler = createScouterIngestHandler({
      isAuthorized: () => true,
      extractFromStorage: vi.fn().mockRejectedValue(extractionError),
      writeGame,
      receiptUrl: vi.fn(),
    });

    const response = await handler(request(validPayload, "internal-token"));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "OCR response was not valid scouter data.",
      raw_response: "not-json",
    });
    expect(writeGame).not.toHaveBeenCalled();
  });

  it("extracts and persists one game through the atomic write boundary", async () => {
    const extracted = {
      smiteMatchId: "smite-match-1",
      gameMode: "Conquest",
      winningSide: "order" as const,
      matchLengthSeconds: 1800,
      participants: [
        {
          side: "order" as const,
          rawIgn: "Known Player",
          godName: "Achilles",
          role: "solo" as const,
          kills: 8,
          deaths: 2,
          assists: 7,
        },
      ],
    };
    const participantsSummary = [
      {
        id: "participant-1",
        side: "order",
        rawIgn: "Known Player",
        playerId: "player-1",
        kills: 8,
        deaths: 2,
        assists: 7,
      },
    ];
    const extractFromStorage = vi.fn().mockResolvedValue(extracted);
    const writeGame = vi.fn().mockResolvedValue({
      code: "inserted",
      applied: true,
      scouterMatchId: "scouter-match-1",
      scouterGameId: "scouter-game-1",
      participantsSummary,
    });
    const handler = createScouterIngestHandler({
      isAuthorized: () => true,
      extractFromStorage,
      writeGame,
      receiptUrl: (matchId, gameId) => `https://sal.example/scouters/${matchId}?game=${gameId}`,
    });

    const response = await handler(request(validPayload, "internal-token"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      scouter_match_id: "scouter-match-1",
      scouter_game_id: "scouter-game-1",
      receipt_url: "https://sal.example/scouters/scouter-match-1?game=scouter-game-1",
      participants_summary: participantsSummary,
    });
    expect(extractFromStorage).toHaveBeenCalledWith(validPayload);
    expect(writeGame).toHaveBeenCalledWith({
      scoreboardImagePath: validPayload.scoreboard_image_path,
      detailsImagePath: validPayload.details_image_path,
      gameOrdinal: validPayload.game_ordinal,
      hostedByDiscordId: validPayload.hosted_by_discord_id,
      seasonId: validPayload.season_id,
      scouterMatchId: undefined,
      extracted,
    });
  });

  it("returns the existing receipt when the SMITE match was already recorded", async () => {
    const handler = createScouterIngestHandler({
      isAuthorized: () => true,
      extractFromStorage: vi.fn().mockResolvedValue({ smiteMatchId: "smite-match-1" }),
      writeGame: vi.fn().mockResolvedValue({
        code: "existing",
        applied: false,
        scouterMatchId: "scouter-match-existing",
        scouterGameId: "scouter-game-existing",
        participantsSummary: [],
      }),
      receiptUrl: (matchId, gameId) => `https://sal.example/scouters/${matchId}?game=${gameId}`,
    });

    const response = await handler(request(validPayload, "internal-token"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      existing_scouter_game_id: "scouter-game-existing",
      receipt_url: "https://sal.example/scouters/scouter-match-existing?game=scouter-game-existing",
    });
  });
});
