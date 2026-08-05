import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { createScouterDraftRoute } from "./route";

const context = { params: Promise.resolve({ draftId: "draft-1" }) };
const game = {
  smiteMatchId: null,
  gameMode: null,
  winningSide: "order" as const,
  matchLengthSeconds: null,
  participants: Array.from({ length: 10 }, (_, index) => ({
    side: index < 5 ? ("order" as const) : ("chaos" as const),
    rawIgn: `Player${index + 1}`,
    kills: 0,
    deaths: 0,
    assists: 0,
  })),
};

describe("/api/scouters/drafts/[draftId]", () => {
  it("requires the host id when reading durable state", async () => {
    const handlers = createScouterDraftRoute({
      isAuthorized: () => true,
      getDraft: vi.fn(),
      reviseDraft: vi.fn(),
    });
    const response = await handlers.GET(
      new NextRequest("https://sal.example/api/scouters/drafts/draft-1"),
      context,
    );
    expect(response.status).toBe(400);
  });

  it("passes the host and optimistic revision to a correction", async () => {
    const reviseDraft = vi.fn().mockResolvedValue({
      code: "revised",
      applied: true,
      draftId: "draft-1",
      revision: 2,
      status: "pending",
      game,
      diagnostics: {
        participantCount: 10,
        duplicateIgns: [],
        unlinkedIgns: [],
        ambiguousIgns: [],
        participants: [],
      },
    });
    const handlers = createScouterDraftRoute({
      isAuthorized: () => true,
      getDraft: vi.fn(),
      reviseDraft,
    });
    const response = await handlers.PATCH(new NextRequest(
      "https://sal.example/api/scouters/drafts/draft-1",
      {
        method: "PATCH",
        body: JSON.stringify({
          hosted_by_discord_id: "host-1",
          expected_revision: 1,
          game,
        }),
      },
    ), context);

    expect(response.status).toBe(200);
    expect(reviseDraft).toHaveBeenCalledWith({
      draftId: "draft-1",
      hostedByDiscordId: "host-1",
      expectedRevision: 1,
      game,
    });
    await expect(response.json()).resolves.toMatchObject({ revision: 2, status: "pending" });
  });
});
