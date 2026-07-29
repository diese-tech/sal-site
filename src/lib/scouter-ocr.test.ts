import { describe, expect, it, vi } from "vitest";
import {
  extractScouterGameFromStorage,
  ScouterExtractionError,
} from "./scouter-ocr";

function modelParticipants() {
  return Array.from({ length: 10 }, (_, index) => ({
    side: index < 5 ? "order" : "chaos",
    rawIgn: index === 0 ? "Known Player" : `Player ${index + 1}`,
    godName: index === 0 ? "Achilles" : null,
    role: ["solo", "jungle", "mid", "support", "carry"][index % 5],
    playerLevel: 20,
    kills: index,
    deaths: 10 - index,
    assists: index + 2,
    gpm: 500 + index,
    playerDamage: 30_000 + index,
    minionDamage: 20_000 + index,
    jungleDamage: 10_000 + index,
    structureDamage: 1_000 + index,
    damageTaken: 25_000 + index,
    damageMitigated: 15_000 + index,
    selfHealing: 500 + index,
    allyHealing: index,
    wardsPlaced: index,
  }));
}

describe("extractScouterGameFromStorage", () => {
  it("combines the scoreboard and details images into one validated game", async () => {
    const downloadImage = vi.fn()
      .mockResolvedValueOnce("data:image/png;base64,scoreboard")
      .mockResolvedValueOnce("data:image/png;base64,details");
    const callVision = vi.fn().mockResolvedValue(JSON.stringify({
      smiteMatchId: "smite-match-1",
      gameMode: "Conquest",
      winningSide: "order",
      matchLengthSeconds: 1800,
      participants: modelParticipants(),
    }));

    const result = await extractScouterGameFromStorage(
      {
        scoreboardImagePath: "scouters/match-1/scoreboard.png",
        detailsImagePath: "scouters/match-1/details.png",
        expectedSmiteMatchId: "smite-match-1",
      },
      { downloadImage, callVision },
    );

    expect(result).toMatchObject({
      smiteMatchId: "smite-match-1",
      gameMode: "Conquest",
      winningSide: "order",
      matchLengthSeconds: 1800,
    });
    expect(result.participants).toHaveLength(10);
    expect(result.participants[0]).toMatchObject({
      rawIgn: "Known Player",
      side: "order",
      godName: "Achilles",
      role: "solo",
      kills: 0,
      deaths: 10,
      assists: 2,
      playerDamage: 30_000,
    });
  });

  it("preserves the raw model response when JSON is invalid", async () => {
    const extraction = extractScouterGameFromStorage(
      {
        scoreboardImagePath: "scoreboard.png",
        detailsImagePath: "details.png",
      },
      {
        downloadImage: vi.fn().mockResolvedValue("data:image/png;base64,image"),
        callVision: vi.fn().mockResolvedValue("not-json"),
      },
    );

    await expect(extraction).rejects.toMatchObject({
      name: "ScouterExtractionError",
      message: "OCR response was not valid JSON.",
      rawResponse: "not-json",
    } satisfies Partial<ScouterExtractionError>);
  });

  it("rejects an OCR match ID that conflicts with the host expectation", async () => {
    const rawResponse = JSON.stringify({
      smiteMatchId: "different-match",
      gameMode: "Conquest",
      winningSide: "order",
      matchLengthSeconds: 1800,
      participants: modelParticipants(),
    });

    await expect(extractScouterGameFromStorage(
      {
        scoreboardImagePath: "scoreboard.png",
        detailsImagePath: "details.png",
        expectedSmiteMatchId: "expected-match",
      },
      {
        downloadImage: vi.fn().mockResolvedValue("data:image/png;base64,image"),
        callVision: vi.fn().mockResolvedValue(rawResponse),
      },
    )).rejects.toMatchObject({
      name: "ScouterExtractionError",
      rawResponse,
    });
  });
});
