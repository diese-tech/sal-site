import { describe, expect, it } from "vitest";
import { buildMatchReportActionContext } from "@/lib/admin-ticket-match-report";

const league = {
  matches: [
    { id: "match-1", homeOrgId: "home-org", awayOrgId: "away-org", status: "scheduled" },
  ],
  orgs: [
    { id: "home-org", name: "Home Team", tag: "HOME" },
    { id: "away-org", name: "Away Team", tag: "AWAY" },
  ],
  players: [
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `player-home-${index + 1}`,
      ign: `HomeIGN${index + 1}`,
      orgId: "home-org",
      archivedAt: undefined,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `player-away-${index + 1}`,
      ign: `AwayIGN${index + 1}`,
      orgId: "away-org",
      archivedAt: undefined,
    })),
  ],
};

function extractedGame(gameNumber = 1, winningSide: "home" | "away" = "home") {
  return {
    gameNumber,
    winningSide,
    players: Array.from({ length: 10 }, (_, index) => ({
      ign: index < 5 ? `HomeIGN${index + 1}` : `AwayIGN${index - 4}`,
      side: index < 5 ? ("home" as const) : ("away" as const),
      kills: index,
      deaths: 10 - index,
      assists: index + 2,
    })),
  };
}

describe("buildMatchReportActionContext", () => {
  it("returns validated, identity-free games that can be submitted for resolution", () => {
    const context = buildMatchReportActionContext(
      {
        id: "report-1",
        match_id: "match-1",
        status: "review",
        screenshot_urls: ["https://cdn.example.com/game.png", "javascript:alert(1)"],
        extracted_data: [extractedGame()],
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
    expect(context.games[0]?.players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ playerIgn: "HomeIGN1", playerId: "player-home-1", won: true }),
        expect.objectContaining({ playerIgn: "AwayIGN1", playerId: "player-away-1", won: false }),
      ]),
    );
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
    const duplicate = extractedGame();
    duplicate.players[1] = { ...duplicate.players[0] };
    const context = buildMatchReportActionContext(
      {
        id: "report-1",
        match_id: "match-1",
        status: "review",
        screenshot_urls: [],
        extracted_data: [duplicate],
      },
      league,
    );

    expect(context.kind).toBe("read_only");
  });

  it("keeps incomplete 5v5 extractions and tied series read-only", () => {
    const incomplete = extractedGame();
    incomplete.players.pop();

    for (const extracted_data of [
      [incomplete],
      [extractedGame(1, "home"), extractedGame(2, "away")],
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
        ).kind,
      ).toBe("read_only");
    }
  });

  it("keeps reports for non-reviewable match states read-only", () => {
    expect(
      buildMatchReportActionContext(
        {
          id: "report-1",
          match_id: "match-1",
          status: "review",
          screenshot_urls: [],
          extracted_data: [extractedGame()],
        },
        { ...league, matches: [{ ...league.matches[0], status: "completed" }] },
      ).kind,
    ).toBe("read_only");
  });
});
