import { describe, expect, it } from "vitest";
import { diagnosticsSchema, reviewedGamesSchema } from "./contracts";

describe("match report host contracts", () => {
  it("accepts canonical text player IDs instead of requiring UUIDs", () => {
    const games = [{
      gameNumber: 1,
      winningSide: "home" as const,
      players: [
        ...Array.from({ length: 5 }, (_, index) => ({
          ign: `Home ${index}`,
          side: "home" as const,
          kills: 1,
          deaths: 0,
          assists: 2,
          playerId: `db02-home-${index + 1}`,
        })),
        ...Array.from({ length: 5 }, (_, index) => ({
          ign: `Away ${index}`,
          side: "away" as const,
          kills: 0,
          deaths: 1,
          assists: 1,
          playerId: `player-away-${index + 1}`,
        })),
      ],
    }];

    expect(reviewedGamesSchema.parse(games)[0]?.players[0]?.playerId).toBe("db02-home-1");
    expect(() => diagnosticsSchema.parse({
      gameCount: 1,
      duplicateIgns: [],
      unlinkedIgns: [],
      ambiguousIgns: [],
      games: [{
        gameNumber: 1,
        players: [{
          index: 0,
          side: "home",
          rawIgn: "Home 0",
          playerId: "db02-home-1",
          identityStatus: "linked",
        }],
      }],
    })).not.toThrow();
  });
});
