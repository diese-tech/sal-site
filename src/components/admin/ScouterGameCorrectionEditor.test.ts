import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScouterGameCorrectionEditor } from "./ScouterGameCorrectionEditor";

const snapshot = {
  id: "game-1",
  matchId: "match-1",
  gameOrdinal: 1,
  revision: 2,
  scoreboardImageUrl: "https://signed.example/scoreboard.png",
  detailsImageUrl: "https://signed.example/details.png",
  game: {
    smiteMatchId: "smite-1",
    gameMode: "Conquest",
    winningSide: "order" as const,
    matchLengthSeconds: 1_800,
    participants: Array.from({ length: 10 }, (_, index) => ({
      id: `participant-${index}`,
      side: index < 5 ? "order" as const : "chaos" as const,
      rawIgn: `OCR Player ${index}`,
      playerId: index === 0 ? "player-1" : null,
      godId: null,
      role: null,
      playerLevel: null,
      kills: 0,
      deaths: 0,
      assists: 0,
      gpm: null,
      playerDamage: 12_345,
      minionDamage: null,
      jungleDamage: null,
      structureDamage: null,
      damageTaken: null,
      damageMitigated: null,
      selfHealing: null,
      allyHealing: null,
      wardsPlaced: null,
    })),
  },
  players: [{ id: "player-1", ign: "Correct Player", discordUsername: "correct-player", status: "active" }],
  gods: [{ id: "god-1", name: "Achilles" }],
};

describe("ScouterGameCorrectionEditor", () => {
  it("renders evidence, all participant rows, identity linkage, and audit confirmation", () => {
    const markup = renderToStaticMarkup(
      createElement(ScouterGameCorrectionEditor, { snapshot }),
    );

    expect(markup).toContain("Original scoreboard");
    expect(markup).toContain("Original details");
    expect(markup).toContain("OCR Player 0");
    expect(markup).toContain("OCR Player 9");
    expect(markup).toContain("Correct Player");
    expect(markup).toContain("12,345");
    expect(markup).toContain("Correction reason");
    expect(markup).toContain("Review all ten rows");
  });
});
