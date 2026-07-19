import { describe, expect, it } from "vitest";
import { buildMatchReportActionContext } from "@/lib/admin-ticket-match-report";

const league = {
  matches: [
    { id: "match-1", homeOrgId: "home-org", awayOrgId: "away-org" },
  ],
  orgs: [
    { id: "home-org", name: "Home Team", tag: "HOME" },
    { id: "away-org", name: "Away Team", tag: "AWAY" },
  ],
  players: [
    { id: "player-home", ign: "HomeIGN", orgId: "home-org", archivedAt: undefined },
    { id: "player-away", ign: "AwayIGN", orgId: "away-org", archivedAt: undefined },
  ],
};

describe("buildMatchReportActionContext", () => {
  it("returns validated, identity-free games that can be submitted for resolution", () => {
    const context = buildMatchReportActionContext(
      {
        id: "report-1",
        match_id: "match-1",
        status: "review",
        screenshot_urls: ["https://cdn.example.com/game.png", "javascript:alert(1)"],
        extracted_data: [
          {
            gameNumber: 1,
            winningSide: "home",
            players: [
              { ign: "HomeIGN", side: "home", kills: 8, deaths: 1, assists: 7 },
              { ign: "AwayIGN", side: "away", kills: 1, deaths: 8, assists: 2 },
            ],
          },
        ],
        submitted_by: "must-not-leak",
        reviewed_by: "must-not-leak-either",
      },
      league,
    );

    expect(context).toMatchObject({
      kind: "resolvable",
      reportId: "report-1",
      matchId: "match-1",
      homeOrg: { name: "Home Team", tag: "HOME" },
      awayOrg: { name: "Away Team", tag: "AWAY" },
      screenshotLinks: [{ label: "Match screenshot 1", href: "https://cdn.example.com/game.png" }],
    });
    if (context.kind !== "resolvable") throw new Error("Expected resolvable context");
    expect(context.games[0]?.players).toEqual([
      expect.objectContaining({ playerIgn: "HomeIGN", playerId: "player-home", won: true }),
      expect.objectContaining({ playerIgn: "AwayIGN", playerId: "player-away", won: false }),
    ]);
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).not.toContain("submitted_by");
    expect(serialized).not.toContain("reviewed_by");
  });

  it("keeps a report read-only when the extracted stats are not safe to submit", () => {
    for (const extracted_data of [
      null,
      [{ gameNumber: 1, winningSide: "unknown", players: [] }],
      [{ gameNumber: 1, winningSide: "home", players: [{ ign: "OnlyHome", side: "home", kills: 1, deaths: 0, assists: 2 }] }],
    ]) {
      expect(
        buildMatchReportActionContext(
          {
            id: "report-1",
            match_id: "match-1",
            status: "review",
            screenshot_urls: [],
            extracted_data,
          },
          league,
        ),
      ).toEqual({
        kind: "read_only",
        reason: "Validated extracted stats are unavailable. Continue in Match Report to review or enter them.",
        workflowHref: "/admin/match-report",
      });
    }
  });

  it("does not resolve duplicate player rows from an extraction", () => {
    const context = buildMatchReportActionContext(
      {
        id: "report-1",
        match_id: "match-1",
        status: "review",
        screenshot_urls: [],
        extracted_data: [
          {
            gameNumber: 1,
            winningSide: "home",
            players: [
              { ign: "HomeIGN", side: "home", kills: 8, deaths: 1, assists: 7 },
              { ign: "HomeIGN", side: "home", kills: 8, deaths: 1, assists: 7 },
              { ign: "AwayIGN", side: "away", kills: 1, deaths: 8, assists: 2 },
            ],
          },
        ],
      },
      league,
    );

    expect(context.kind).toBe("read_only");
  });
});
