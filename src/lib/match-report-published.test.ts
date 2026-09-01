import { describe, expect, it } from "vitest";
import { groupPublishedStats, groupRowsByReport, type PublishedStatRow } from "./match-report-published";

function row(over: Partial<PublishedStatRow> = {}): PublishedStatRow {
  return {
    match_report_id: "r1", game_number: 1, player_ign: "Alpha", player_id: "p1",
    org_id: "home-org", won: true, kills: 5, deaths: 1, assists: 3,
    god_played: "Ymir", role: "Solo", damage_dealt: 100, damage_mitigated: 200,
    ...over,
  };
}

describe("groupPublishedStats", () => {
  it("splits rows into sides by org and orders games", () => {
    const games = groupPublishedStats([
      row({ game_number: 2, player_ign: "Beta", org_id: "away-org", won: true }),
      row({ game_number: 1, player_ign: "Alpha", org_id: "home-org", won: true }),
      row({ game_number: 1, player_ign: "Gamma", org_id: "away-org", won: false }),
    ], "home-org");

    expect(games.map((g) => g.gameNumber)).toEqual([1, 2]);
    expect(games[0]!.winningSide).toBe("home");
    expect(games[0]!.players.map((p) => p.side)).toEqual(["home", "away"]);
    expect(games[1]!.winningSide).toBe("away");
  });

  it("maps nullable database columns onto optional fields", () => {
    const [game] = groupPublishedStats([
      row({ player_id: null, god_played: null, role: null, damage_dealt: null, damage_mitigated: null }),
    ], "home-org");

    expect(game!.players[0]).toMatchObject({
      ign: "Alpha", side: "home", kills: 5, deaths: 1, assists: 3,
    });
    expect(game!.players[0]!.playerId).toBeUndefined();
    expect(game!.players[0]!.god).toBeUndefined();
    expect(game!.players[0]!.damageDealt).toBeUndefined();
  });

  it("reports unknown rather than defaulting to home when no row won", () => {
    const [game] = groupPublishedStats([row({ won: false })], "home-org");
    expect(game!.winningSide).toBe("unknown");
  });

  it("returns no games for no rows", () => {
    expect(groupPublishedStats([], "home-org")).toEqual([]);
  });
});

describe("groupRowsByReport", () => {
  it("keys rows by their report id", () => {
    const grouped = groupRowsByReport([
      row({ match_report_id: "r1" }),
      row({ match_report_id: "r2" }),
      row({ match_report_id: "r1", game_number: 2 }),
    ]);
    expect(grouped.get("r1")).toHaveLength(2);
    expect(grouped.get("r2")).toHaveLength(1);
  });
});
