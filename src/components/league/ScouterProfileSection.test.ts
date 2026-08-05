import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScouterProfileSection } from "./ScouterProfileSection";
import type { ScouterProfile } from "@/lib/scouter-profile";

const profile: ScouterProfile = {
  selectedSeason: {
    id: "preseason2",
    name: "Preseason 2",
    status: "pre-season",
    startDate: "2026-07-01",
  },
  availableSeasons: [],
  summary: {
    gamesPlayed: 1,
    wins: 1,
    losses: 0,
    averageKda: 9,
    averageDamage: 28000,
    averageGpm: 600,
    averageMinionDamage: 18000,
    averageJungleDamage: 5000,
    averageStructureDamage: 0,
    averageDamageTaken: 15000,
    averageDamageMitigated: null,
    averageSelfHealing: 0,
    averageAllyHealing: 2500,
    averageWardsPlaced: 5,
  },
  games: [
    {
      id: "game-1",
      matchId: "match-1",
      seasonId: "preseason2",
      hostedAt: "2026-07-28T12:00:00Z",
      smiteMatchId: "smite-1",
      rawIgn: "Player One",
      side: "order",
      godName: "Ra",
      role: "mid",
      playerLevel: 20,
      kills: 8,
      deaths: 2,
      assists: 10,
      gpm: 600,
      playerDamage: 28000,
      minionDamage: 18000,
      jungleDamage: 5000,
      structureDamage: 0,
      damageTaken: 15000,
      damageMitigated: null,
      selfHealing: 0,
      allyHealing: 2500,
      wardsPlaced: 5,
      won: true,
    },
  ],
};

function renderProfile() {
  return renderToStaticMarkup(
    createElement(ScouterProfileSection, { playerId: "player-1", profile }),
  );
}

describe("ScouterProfileSection", () => {
  it("keeps the summary compact and exposes every persisted stat on demand", () => {
    const markup = renderProfile();

    expect(markup).toContain("Season averages");
    expect(markup).toContain("Full recorded line");
    for (const label of [
      "Recorded IGN",
      "Side",
      "God",
      "Role",
      "Player level",
      "K / D / A",
      "GPM",
      "Player damage",
      "Minion damage",
      "Jungle damage",
      "Structure damage",
      "Damage taken",
      "Damage mitigated",
      "Self healing",
      "Ally healing",
      "Wards placed",
    ]) {
      expect(markup).toContain(label);
    }
  });

  it("renders recorded zero separately from an unreadable nullable stat", () => {
    const markup = renderProfile();

    expect(markup).toMatch(/Structure damage<\/dt><dd[^>]*>0<\/dd>/);
    expect(markup).toMatch(/Damage mitigated<\/dt><dd[^>]*>—<\/dd>/);
  });

  it("renders the season selector and receipt link", () => {
    const markup = renderToStaticMarkup(
      createElement(ScouterProfileSection, {
        playerId: "player-1",
        profile: {
          ...profile,
          availableSeasons: [
            profile.selectedSeason!,
            {
              id: "season1",
              name: "Season 1",
              status: "complete",
              startDate: "2026-04-01",
            },
          ],
        },
      }),
    );

    expect(markup).toContain('name="season"');
    expect(markup).toContain('value="season1"');
    expect(markup).toContain('href="/scouters/match-1"');
    expect(markup).toContain("smite-1");
  });

  it("renders a useful empty state for the current season", () => {
    const markup = renderToStaticMarkup(
      createElement(ScouterProfileSection, {
        playerId: "player-1",
        profile: {
          ...profile,
          summary: {
            ...profile.summary,
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            averageKda: 0,
            averageDamage: null,
          },
          games: [],
        },
      }),
    );

    expect(markup).toContain("No scouter games recorded for Preseason 2");
  });

  it("offers a historical season when the selected season has no games", () => {
    const markup = renderToStaticMarkup(
      createElement(ScouterProfileSection, {
        playerId: "player-1",
        profile: {
          ...profile,
          availableSeasons: [
            {
              id: "season1",
              name: "Season 1",
              status: "complete",
              startDate: "2026-04-01",
            },
          ],
          summary: {
            ...profile.summary,
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            averageKda: 0,
            averageDamage: null,
          },
          games: [],
        },
      }),
    );

    expect(markup).toContain('name="season"');
    expect(markup).toContain('value="season1"');
  });
});
