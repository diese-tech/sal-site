import { describe, expect, it } from "vitest";
import { getScouterReceipt } from "./scouter-receipt";

describe("getScouterReceipt", () => {
  it("loads and orders the public match receipt", async () => {
    const filters: Array<[string, unknown]> = [];
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => (
        filters.push([column, value]), builder
      ),
      maybeSingle: () => Promise.resolve({
        data: {
          id: "scouter-match-1",
          season_id: "preseason2",
          hosted_by_discord_id: "discord-host",
          hosted_at: "2026-07-29T12:00:00Z",
          games: [
            {
              id: "game-2",
              game_ordinal: 2,
              smite_match_id: "smite-2",
              game_mode: "Conquest",
              winning_side: "chaos",
              match_length_seconds: 1900,
              participants: [
                {
                  id: "participant-2",
                  side: "chaos",
                  raw_ign: "Unlinked",
                  player_id: null,
                  role: "mid",
                  kills: 5,
                  deaths: 3,
                  assists: 8,
                  player_damage: 22000,
                  wards_placed: 4,
                },
              ],
            },
            {
              id: "game-1",
              game_ordinal: 1,
              smite_match_id: "smite-1",
              game_mode: "Conquest",
              winning_side: "order",
              match_length_seconds: 1800,
              participants: [],
            },
          ],
        },
        error: null,
      }),
    };

    const receipt = await getScouterReceipt("scouter-match-1", {
      from: (table: string) => {
        expect(table).toBe("scouter_matches");
        return builder;
      },
    } as never);

    expect(filters).toEqual([["id", "scouter-match-1"]]);
    expect(receipt).toMatchObject({
      id: "scouter-match-1",
      seasonId: "preseason2",
      games: [
        { id: "game-1", gameOrdinal: 1 },
        {
          id: "game-2",
          gameOrdinal: 2,
          participants: [{ rawIgn: "Unlinked", playerId: null }],
        },
      ],
    });
  });
});
