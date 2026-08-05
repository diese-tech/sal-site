import { describe, expect, it, vi } from "vitest";
import {
  cancelScouterGameDraft,
  confirmScouterGameDraft,
  createScouterGameDraft,
  getScouterGameDraft,
  reviseScouterGameDraft,
} from "./scouter-drafts";

const game = {
  smiteMatchId: "smite-1",
  gameMode: "Conquest",
  winningSide: "order" as const,
  matchLengthSeconds: 1800,
  participants: Array.from({ length: 10 }, (_, index) => ({
    side: index < 5 ? ("order" as const) : ("chaos" as const),
    rawIgn: `Player${index + 1}`,
    godName: "Ra",
    role: index % 5 === 0 ? ("solo" as const) : null,
    kills: index,
    deaths: 1,
    assists: 10 - index,
  })),
};

const diagnostics = {
  participantCount: 10,
  duplicateIgns: [],
  unlinkedIgns: ["Player10"],
  ambiguousIgns: [],
  participants: game.participants.map((participant, index) => ({
    index,
    side: participant.side,
    rawIgn: participant.rawIgn,
    playerId: index === 9 ? null : `player-${index + 1}`,
    identityStatus: index === 9 ? ("unlinked" as const) : ("linked" as const),
  })),
};

const draftResult = {
  code: "created",
  applied: true,
  draftId: "draft-1",
  revision: 1,
  status: "pending",
  game,
  diagnostics,
};

describe("scouter draft database contract", () => {
  it("creates a durable draft without calling canonical ingest", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: draftResult, error: null });

    await expect(createScouterGameDraft({ rpc } as never, {
      scoreboardImagePath: "scouters/scope/game-1/scoreboard.png",
      detailsImagePath: "scouters/scope/game-1/details.png",
      gameOrdinal: 1,
      hostedByDiscordId: "host-1",
      seasonId: "season-1",
      extracted: game,
    })).resolves.toMatchObject({ draftId: "draft-1", status: "pending" });

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0][0]).toBe("create_scouter_game_draft");
    expect(rpc).not.toHaveBeenCalledWith("ingest_scouter_game", expect.anything());
  });

  it("reads a draft by both id and host and refreshes identity diagnostics", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "draft-1",
        revision: 2,
        status: "pending",
        season_id: "season-1",
        hosted_by_discord_id: "host-1",
        scouter_match_id: null,
        game_ordinal: 1,
        scoreboard_image_path: "scoreboard.png",
        details_image_path: "details.png",
        extracted_game: game,
        revised_game: null,
      },
      error: null,
    });
    const eq = vi.fn().mockReturnThis();
    const select = vi.fn().mockReturnValue({ eq, maybeSingle });
    eq.mockReturnValue({ eq, maybeSingle });
    const rpc = vi.fn().mockResolvedValue({ data: diagnostics, error: null });

    const result = await getScouterGameDraft({
      from: vi.fn().mockReturnValue({ select }),
      rpc,
    } as never, "draft-1", "host-1");

    expect(eq).toHaveBeenNthCalledWith(1, "id", "draft-1");
    expect(eq).toHaveBeenNthCalledWith(2, "hosted_by_discord_id", "host-1");
    expect(result).toMatchObject({ draftId: "draft-1", hostedByDiscordId: "host-1" });
    expect(rpc).toHaveBeenCalledWith("scouter_game_draft_diagnostics", { p_game: game });
  });

  it("uses optimistic revision for edits", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ...draftResult, code: "revised", revision: 2 },
      error: null,
    });

    await reviseScouterGameDraft({ rpc } as never, {
      draftId: "draft-1",
      hostedByDiscordId: "host-1",
      expectedRevision: 1,
      game,
    });

    expect(rpc).toHaveBeenCalledWith("revise_scouter_game_draft", expect.objectContaining({
      p_draft_id: "draft-1",
      p_hosted_by_discord_id: "host-1",
      p_expected_revision: 1,
      p_revised_game: game,
    }));
  });

  it("parses idempotent cancellation and confirmation", async () => {
    const cancelRpc = vi.fn().mockResolvedValue({
      data: {
        code: "already_cancelled",
        applied: false,
        draftId: "draft-1",
        revision: 2,
        status: "cancelled",
      },
      error: null,
    });
    await expect(cancelScouterGameDraft({ rpc: cancelRpc } as never, "draft-1", "host-1"))
      .resolves.toMatchObject({ code: "already_cancelled", applied: false });

    const confirmRpc = vi.fn().mockResolvedValue({
      data: {
        code: "already_confirmed",
        applied: false,
        draftId: "draft-2",
        revision: 3,
        status: "confirmed",
        scouterMatchId: "match-1",
        scouterGameId: "game-1",
      },
      error: null,
    });
    await expect(confirmScouterGameDraft({ rpc: confirmRpc } as never, {
      draftId: "draft-2",
      hostedByDiscordId: "host-1",
      expectedRevision: 3,
    })).resolves.toMatchObject({ code: "already_confirmed", scouterGameId: "game-1" });
  });
});
