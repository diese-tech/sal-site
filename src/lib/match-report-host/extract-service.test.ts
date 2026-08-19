import { describe, expect, it } from "vitest";
import { completeGamesForHostReview, resetIncompleteExtraction } from "./extract-service";
import type { HostMatchReportReview } from "@/types/match-report-host";

const reportId = "11111111-1111-4111-8111-111111111111";
const review: HostMatchReportReview = {
  report: {
    id: reportId,
    revision: 1,
    status: "extracting",
    screenshotUrls: ["https://cdn.example/game.png"],
    games: [],
    diagnostics: { gameCount: 0, duplicateIgns: [], unlinkedIgns: [], ambiguousIgns: [], games: [] },
  },
  match: {
    id: "match-1",
    seasonId: "season-1",
    divisionId: "terra",
    scheduledDate: "2026-08-18",
    week: 1,
    home: {
      id: "home", name: "Home", tag: "H",
      roster: Array.from({ length: 5 }, (_, index) => ({ id: `home-${index}`, ign: `Home${index}` })),
    },
    away: {
      id: "away", name: "Away", tag: "A",
      roster: Array.from({ length: 5 }, (_, index) => ({ id: `away-${index}`, ign: `Away${index}` })),
    },
  },
};

describe("host OCR recovery", () => {
  it("turns an OCR failure into editable 5v5 roster rows while leaving the winner unresolved", () => {
    const games = completeGamesForHostReview(
      [{ gameNumber: 1, winningSide: "unknown", players: [] }],
      review,
    );

    expect(games[0]?.winningSide).toBe("unknown");
    expect(games[0]?.players).toHaveLength(10);
    expect(games[0]?.players.filter((player) => player.side === "home")).toHaveLength(5);
    expect(games[0]?.players.filter((player) => player.side === "away")).toHaveLength(5);
  });

  it("reports an optimistic conflict when an incomplete-extraction reset loses its revision", async () => {
    const query = {
      update() { return this; },
      eq() { return this; },
      select() { return this; },
      single: async () => ({ data: null, error: { code: "PGRST116", message: "No row" } }),
    };

    await expect(resetIncompleteExtraction(
      { from: () => query },
      { matchReportId: reportId, hostDiscordId: "host-1", extractingRevision: 2, nextRevision: 3 },
    )).rejects.toMatchObject({ code: "40001" });
  });
});
