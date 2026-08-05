import { describe, expect, it } from "vitest";
import { getPlayerScouterProfile } from "./scouter-profile";

const participantRows = [
  {
    id: "participant-2",
    side: "chaos",
    raw_ign: "Player One",
    player_level: 18,
    kills: 2,
    deaths: 4,
    assists: 6,
    gpm: 450,
    player_damage: 12000,
    minion_damage: 10000,
    jungle_damage: null,
    structure_damage: 0,
    damage_taken: 22000,
    damage_mitigated: 30000,
    self_healing: 500,
    ally_healing: 1000,
    wards_placed: 3,
    role: "support",
    god: { name: "Ymir" },
    game: {
      id: "game-2",
      smite_match_id: "smite-2",
      winning_side: "order",
      match: {
        id: "match-2",
        season_id: "preseason2",
        hosted_at: "2026-07-29T12:00:00Z",
        season: {
          id: "preseason2",
          name: "Preseason 2",
          status: "pre-season",
          start_date: "2026-07-01",
        },
      },
    },
  },
  {
    id: "participant-1",
    side: "order",
    raw_ign: "Player One",
    player_level: 20,
    kills: 8,
    deaths: 2,
    assists: 10,
    gpm: 600,
    player_damage: 28000,
    minion_damage: 18000,
    jungle_damage: 5000,
    structure_damage: 4000,
    damage_taken: 15000,
    damage_mitigated: null,
    self_healing: 0,
    ally_healing: 2500,
    wards_placed: 5,
    role: "mid",
    god: { name: "Ra" },
    game: {
      id: "game-1",
      smite_match_id: "smite-1",
      winning_side: "order",
      match: {
        id: "match-1",
        season_id: "preseason2",
        hosted_at: "2026-07-28T12:00:00Z",
        season: {
          id: "preseason2",
          name: "Preseason 2",
          status: "pre-season",
          start_date: "2026-07-01",
        },
      },
    },
  },
  {
    id: "participant-old",
    side: "chaos",
    raw_ign: "Legacy IGN",
    player_level: null,
    kills: 4,
    deaths: 2,
    assists: 4,
    gpm: null,
    player_damage: 18000,
    minion_damage: null,
    jungle_damage: null,
    structure_damage: null,
    damage_taken: null,
    damage_mitigated: null,
    self_healing: null,
    ally_healing: null,
    wards_placed: 2,
    role: "solo",
    god: null,
    game: {
      id: "game-old",
      smite_match_id: "smite-old",
      winning_side: "chaos",
      match: {
        id: "match-old",
        season_id: "season1",
        hosted_at: "2026-05-01T12:00:00Z",
        season: {
          id: "season1",
          name: "Season 1",
          status: "complete",
          start_date: "2026-04-01",
        },
      },
    },
  },
];

function fakeClient(rows = participantRows) {
  const filters: Array<[string, unknown]> = [];
  const seasonBuilder = {
    select: () => seasonBuilder,
    eq: (column: string, value: unknown) => (
      filters.push([column, value]),
      seasonBuilder
    ),
    in: (column: string, values: string[]) => (
      filters.push([column, values]),
      seasonBuilder
    ),
    order: (column: string, options: unknown) => (
      filters.push([column, options]),
      seasonBuilder
    ),
    limit: (value: number) => (filters.push(["limit", value]), seasonBuilder),
    maybeSingle: () =>
      Promise.resolve({
        data: {
          id: "preseason2",
          name: "Preseason 2",
          status: "pre-season",
          start_date: "2026-07-01",
        },
        error: null,
      }),
  };
  const participantBuilder = {
    select: () => participantBuilder,
    eq: (column: string, value: unknown) => (
      filters.push([column, value]),
      participantBuilder
    ),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return {
    filters,
    client: {
      from: (table: string) => {
        if (table === "seasons") return seasonBuilder;
        expect(table).toBe("scouter_game_participants");
        return participantBuilder;
      },
    } as never,
  };
}

describe("getPlayerScouterProfile", () => {
  it("defaults to the newest active or pre-season and aggregates its games", async () => {
    const { client, filters } = fakeClient();

    const profile = await getPlayerScouterProfile(
      "player-1",
      undefined,
      client,
    );

    expect(filters).toEqual(
      expect.arrayContaining([
        ["status", ["active", "pre-season"]],
        ["is_current", true],
        ["player_id", "player-1"],
      ]),
    );
    expect(profile.selectedSeason).toMatchObject({
      id: "preseason2",
      name: "Preseason 2",
    });
    expect(profile.availableSeasons.map((season) => season.id)).toEqual([
      "preseason2",
      "season1",
    ]);
    expect(profile.summary).toEqual({
      gamesPlayed: 2,
      wins: 1,
      losses: 1,
      averageKda: 5.5,
      averageDamage: 20000,
      averageGpm: 525,
      averageMinionDamage: 14000,
      averageJungleDamage: 5000,
      averageStructureDamage: 2000,
      averageDamageTaken: 18500,
      averageDamageMitigated: 30000,
      averageSelfHealing: 250,
      averageAllyHealing: 1750,
      averageWardsPlaced: 4,
    });
    expect(profile.games.map((game) => game.id)).toEqual(["game-2", "game-1"]);
    expect(profile.games[0]).toMatchObject({
      matchId: "match-2",
      rawIgn: "Player One",
      side: "chaos",
      godName: "Ymir",
      playerLevel: 18,
      gpm: 450,
      minionDamage: 10000,
      jungleDamage: null,
      structureDamage: 0,
      damageTaken: 22000,
      damageMitigated: 30000,
      selfHealing: 500,
      allyHealing: 1000,
      won: false,
    });
  });

  it("honors a season from the player's distinct scouter seasons", async () => {
    const { client } = fakeClient();

    const profile = await getPlayerScouterProfile(
      "player-1",
      "season1",
      client,
    );

    expect(profile.selectedSeason?.id).toBe("season1");
    expect(profile.summary).toMatchObject({
      gamesPlayed: 1,
      wins: 1,
      losses: 0,
      averageDamage: 18000,
      averageGpm: null,
      averageDamageTaken: null,
      averageWardsPlaced: 2,
    });
    expect(profile.games[0]).toMatchObject({
      rawIgn: "Legacy IGN",
      godName: null,
      role: "solo",
      gpm: null,
    });
  });

  it("returns an empty current-season view when the player has no scouter games", async () => {
    const { client } = fakeClient([]);

    const profile = await getPlayerScouterProfile(
      "player-1",
      undefined,
      client,
    );

    expect(profile.selectedSeason?.id).toBe("preseason2");
    expect(profile.availableSeasons).toEqual([]);
    expect(profile.games).toEqual([]);
    expect(profile.summary).toMatchObject({
      gamesPlayed: 0,
      averageDamage: null,
      averageGpm: null,
      averageDamageMitigated: null,
    });
  });
});
