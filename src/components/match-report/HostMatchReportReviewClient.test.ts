import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  applyHostScreenshotUpload,
  hasBlockingIdentityDiagnostics,
  HostIdentityStatusBadge,
  identityStatusesForGame,
} from "./HostMatchReportReviewClient";
import type { HostMatchReportReview } from "@/types/match-report-host";

describe("host match-report publication guard", () => {
  it("blocks submission whenever an identity is not uniquely linked", () => {
    expect(hasBlockingIdentityDiagnostics({
      gameCount: 1,
      duplicateIgns: [],
      unlinkedIgns: ["UnknownIGN"],
      ambiguousIgns: [],
      games: [],
    })).toBe(true);
    expect(hasBlockingIdentityDiagnostics({
      gameCount: 1,
      duplicateIgns: [],
      unlinkedIgns: [],
      ambiguousIgns: [],
      games: [],
    })).toBe(false);
  });

  it("retains each successful sequential upload receipt before a later request can fail", () => {
    const review = {
      report: {
        id: "11111111-1111-4111-8111-111111111111",
        revision: 1,
        status: "pending",
        screenshotUrls: [],
        games: [],
        diagnostics: { gameCount: 0, duplicateIgns: [], unlinkedIgns: [], ambiguousIgns: [], games: [] },
      },
      match: {
        id: "match-1", seasonId: "season-1", divisionId: "terra", scheduledDate: "2026-08-18", week: 1,
        home: { id: "home", name: "Home", tag: "H", roster: [] },
        away: { id: "away", name: "Away", tag: "A", roster: [] },
      },
    } satisfies HostMatchReportReview;

    const afterFirst = applyHostScreenshotUpload(review, {
      allUrls: ["https://cdn.example/game-1.jpg"],
      revision: 2,
    });

    expect(afterFirst.report.screenshotUrls).toEqual(["https://cdn.example/game-1.jpg"]);
    expect(afterFirst.report.revision).toBe(2);
  });

  it("maps and visibly labels duplicate and ambiguous identities on their player rows", () => {
    const diagnostics = {
      gameCount: 1,
      duplicateIgns: ["MirrorIGN"],
      unlinkedIgns: [],
      ambiguousIgns: ["SharedIGN"],
      games: [{
        gameNumber: 1,
        players: [
          { index: 2, side: "home" as const, rawIgn: "MirrorIGN", playerId: "player-home-3", identityStatus: "duplicate" as const },
          { index: 7, side: "away" as const, rawIgn: "SharedIGN", playerId: null, identityStatus: "ambiguous" as const },
        ],
      }],
    };

    const statuses = identityStatusesForGame(diagnostics, 1);
    expect(statuses.get(2)).toBe("duplicate");
    expect(statuses.get(7)).toBe("ambiguous");

    const markup = renderToStaticMarkup(createElement("div", null,
      createElement(HostIdentityStatusBadge, { status: statuses.get(2)! }),
      createElement(HostIdentityStatusBadge, { status: statuses.get(7)! }),
    ));
    expect(markup).toContain("Duplicate identity");
    expect(markup).toContain("Ambiguous identity");
  });
});
