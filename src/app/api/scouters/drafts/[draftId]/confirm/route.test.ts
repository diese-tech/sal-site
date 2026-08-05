import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { createScouterDraftConfirmHandler } from "./route";

const context = { params: Promise.resolve({ draftId: "draft-1" }) };

describe("POST /api/scouters/drafts/[draftId]/confirm", () => {
  it("returns the public receipt only after confirmation", async () => {
    const confirmDraft = vi.fn().mockResolvedValue({
      code: "inserted",
      applied: true,
      draftId: "draft-1",
      revision: 2,
      status: "confirmed",
      scouterMatchId: "match-1",
      scouterGameId: "game-1",
      identityOverrideApplied: false,
      participantsSummary: [],
    });
    const handler = createScouterDraftConfirmHandler({
      isAuthorized: () => true,
      confirmDraft,
    });
    const response = await handler(new NextRequest(
      "https://sal.example/api/scouters/drafts/draft-1/confirm",
      {
        method: "POST",
        body: JSON.stringify({
          hosted_by_discord_id: "host-1",
          expected_revision: 2,
        }),
      },
    ), context);
    const body = await response.json();

    expect(confirmDraft).toHaveBeenCalledWith({
      draftId: "draft-1",
      hostedByDiscordId: "host-1",
      expectedRevision: 2,
    });
    expect(body).toMatchObject({
      status: "confirmed",
      scouter_match_id: "match-1",
      scouter_game_id: "game-1",
      receipt_url: "https://sal.gg/scouters/match-1?game=game-1",
    });
  });
});
