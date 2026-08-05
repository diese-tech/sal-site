import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { ScouterExtractionError } from "@/lib/scouter-ocr";
import { createScouterExtractHandler } from "./route";

const requestBody = {
  scoreboard_image_path: "scouters/scope/game-1/scoreboard.png",
  details_image_path: "scouters/scope/game-1/details.png",
  game_ordinal: 1,
  hosted_by_discord_id: "host-1",
  season_id: "season-1",
};

const game = {
  smiteMatchId: "smite-1",
  gameMode: "Conquest",
  winningSide: "order" as const,
  matchLengthSeconds: 1800,
  participants: Array.from({ length: 10 }, (_, index) => ({
    side: index < 5 ? ("order" as const) : ("chaos" as const),
    rawIgn: `Player${index + 1}`,
    kills: 1,
    deaths: 1,
    assists: 1,
  })),
};

function request(body: unknown = requestBody) {
  return new NextRequest("https://sal.example/api/scouters/extract", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/scouters/extract", () => {
  it("rejects callers without the internal token", async () => {
    const handler = createScouterExtractHandler({
      isAuthorized: () => false,
      extractFromStorage: vi.fn(),
      createDraft: vi.fn(),
    });
    expect((await handler(request())).status).toBe(401);
  });

  it("extracts into a pending draft and does not expose a canonical receipt", async () => {
    const createDraft = vi.fn().mockResolvedValue({
      code: "created",
      applied: true,
      draftId: "draft-1",
      revision: 1,
      status: "pending",
      game,
      diagnostics: {
        participantCount: 10,
        duplicateIgns: ["Player1"],
        unlinkedIgns: [],
        ambiguousIgns: [],
        participants: [],
      },
    });
    const handler = createScouterExtractHandler({
      isAuthorized: () => true,
      extractFromStorage: vi.fn().mockResolvedValue(game),
      createDraft,
    });

    const response = await handler(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ draft_id: "draft-1", status: "pending", revision: 1 });
    expect(body).not.toHaveProperty("scouter_game_id");
    expect(body).not.toHaveProperty("receipt_url");
    expect(createDraft).toHaveBeenCalledWith(expect.objectContaining({ extracted: game }));
  });

  it("returns raw invalid OCR output without creating a draft", async () => {
    const createDraft = vi.fn();
    const handler = createScouterExtractHandler({
      isAuthorized: () => true,
      extractFromStorage: vi.fn().mockRejectedValue(
        new ScouterExtractionError("OCR response was not valid scouter data.", "{bad}"),
      ),
      createDraft,
    });
    const response = await handler(request());
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "OCR response was not valid scouter data.",
      raw_response: "{bad}",
    });
    expect(createDraft).not.toHaveBeenCalled();
  });
});
