import { describe, expect, it, vi } from "vitest";
import { writeScouterGame } from "./scouter-writes";

const extracted = {
  smiteMatchId: "smite-match-1",
  gameMode: "Conquest",
  winningSide: "order" as const,
  matchLengthSeconds: 1800,
  participants: Array.from({ length: 10 }, (_, index) => ({
    side: index < 5 ? ("order" as const) : ("chaos" as const),
    rawIgn: `Player ${index + 1}`,
    godName: null,
    role: null,
    playerLevel: 20,
    kills: index,
    deaths: 10 - index,
    assists: index + 1,
  })),
};

describe("writeScouterGame", () => {
  it("uses the atomic database RPC and returns its validated receipt data", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        code: "inserted",
        applied: true,
        scouterMatchId: "scouter-match-1",
        scouterGameId: "scouter-game-1",
        participantsSummary: [],
      },
      error: null,
    });

    const result = await writeScouterGame(
      {
        scoreboardImagePath: "scouters/match-1/scoreboard.png",
        detailsImagePath: "scouters/match-1/details.png",
        gameOrdinal: 1,
        hostedByDiscordId: "discord-host-1",
        seasonId: "preseason2",
        extracted,
      },
      { rpc },
    );

    expect(result).toEqual({
      code: "inserted",
      applied: true,
      scouterMatchId: "scouter-match-1",
      scouterGameId: "scouter-game-1",
      participantsSummary: [],
    });
    expect(rpc).toHaveBeenCalledWith("ingest_scouter_game", {
      p_season_id: "preseason2",
      p_hosted_by_discord_id: "discord-host-1",
      p_game_ordinal: 1,
      p_scoreboard_image_path: "scouters/match-1/scoreboard.png",
      p_details_image_path: "scouters/match-1/details.png",
      p_participants: extracted.participants,
      p_smite_match_id: "smite-match-1",
      p_game_mode: "Conquest",
      p_winning_side: "order",
      p_match_length_seconds: 1800,
    });
  });

  it("fails closed when the database returns an unexpected contract", async () => {
    await expect(writeScouterGame(
      {
        scoreboardImagePath: "scoreboard.png",
        detailsImagePath: "details.png",
        gameOrdinal: 1,
        hostedByDiscordId: "discord-host-1",
        seasonId: "preseason2",
        extracted,
      },
      { rpc: vi.fn().mockResolvedValue({ data: { applied: true }, error: null }) },
    )).rejects.toThrow("Scouter ingest returned an invalid database response.");
  });
});
