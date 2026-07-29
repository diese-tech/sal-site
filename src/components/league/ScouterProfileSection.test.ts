import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScouterProfileSection } from "./ScouterProfileSection";

describe("ScouterProfileSection", () => {
  it("renders the selected-season summary, selector, and per-game links", () => {
    const html = renderToStaticMarkup(
      ScouterProfileSection({
        playerId: "player-1",
        profile: {
          selectedSeason: {
            id: "preseason2",
            name: "Preseason 2",
            status: "pre-season",
            startDate: "2026-07-01",
          },
          availableSeasons: [
            {
              id: "preseason2",
              name: "Preseason 2",
              status: "pre-season",
              startDate: "2026-07-01",
            },
            {
              id: "season1",
              name: "Season 1",
              status: "complete",
              startDate: "2026-04-01",
            },
          ],
          summary: {
            gamesPlayed: 2,
            wins: 1,
            losses: 1,
            averageKda: 5.5,
            averageDamage: 20000,
          },
          games: [
            {
              id: "game-2",
              matchId: "match-2",
              seasonId: "preseason2",
              hostedAt: "2026-07-29T12:00:00Z",
              smiteMatchId: "smite-2",
              godName: "Ymir",
              role: "support",
              kills: 2,
              deaths: 4,
              assists: 6,
              playerDamage: 12000,
              wardsPlaced: 3,
              won: false,
            },
          ],
        },
      }),
    );

    expect(html).toContain("Scouter Stats");
    expect(html).toContain("Preseason 2");
    expect(html).toContain("1-1");
    expect(html).toContain("5.50");
    expect(html).toContain("20,000");
    expect(html).toContain('name="season"');
    expect(html).toContain('value="season1"');
    expect(html).toContain('href="/scouters/match-2"');
    expect(html).toContain("smite-2");
    expect(html).toContain("Ymir");
  });

  it("renders a useful empty state for the current season", () => {
    const html = renderToStaticMarkup(
      ScouterProfileSection({
        playerId: "player-1",
        profile: {
          selectedSeason: {
            id: "preseason2",
            name: "Preseason 2",
            status: "pre-season",
            startDate: "2026-07-01",
          },
          availableSeasons: [],
          summary: {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            averageKda: 0,
            averageDamage: 0,
          },
          games: [],
        },
      }),
    );

    expect(html).toContain("No scouter games recorded for Preseason 2");
  });

  it("shows the selector when only a historical season has games", () => {
    const html = renderToStaticMarkup(
      ScouterProfileSection({
        playerId: "player-1",
        profile: {
          selectedSeason: {
            id: "preseason2",
            name: "Preseason 2",
            status: "pre-season",
            startDate: "2026-07-01",
          },
          availableSeasons: [
            {
              id: "season1",
              name: "Season 1",
              status: "complete",
              startDate: "2026-04-01",
            },
          ],
          summary: {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            averageKda: 0,
            averageDamage: 0,
          },
          games: [],
        },
      }),
    );

    expect(html).toContain('name="season"');
    expect(html).toContain('value="season1"');
  });
});
