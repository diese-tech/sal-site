import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LeagueData } from "@/types/league";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { AdminMatchesClient } from "./AdminMatchesClient";

function leagueData(): LeagueData {
  return {
    season: {
      id: "s2",
      name: "Season 2",
      status: "pre-season",
      isCurrent: true,
      startDate: "2026-08-01",
      endDate: "2026-12-01",
      currentWeek: 0,
    },
    divisions: [
      { id: "terra", name: "Terra", description: "", tier: 1, accentColor: "#22d3ee" },
    ],
    orgs: [],
    players: [],
    matches: [],
    standings: [],
    announcements: [],
    lastUpdated: "2026-08-09T00:00:00Z",
  };
}

describe("AdminMatchesClient authorization affordances", () => {
  it("shows the schedule-match control to a regular admin", () => {
    const html = renderToStaticMarkup(createElement(AdminMatchesClient, {
      data: leagueData(),
      isSuperAdmin: false,
    }));

    expect(html).toContain("+ Schedule Match");
  });

  it("hides every routine mutation control for a pending-delete match", () => {
    const data = leagueData();
    data.orgs = [
      { id: "home", name: "Home", tag: "H", divisionId: "terra", logoInitials: "H", logoGradient: "", primaryColor: "#fff", accentGradient: "" },
      { id: "away", name: "Away", tag: "A", divisionId: "terra", logoInitials: "A", logoGradient: "", primaryColor: "#fff", accentGradient: "" },
    ];
    data.matches = [{
      id: "match-1",
      seasonId: "s2",
      divisionId: "terra",
      homeOrgId: "home",
      awayOrgId: "away",
      scheduledDate: "2026-08-10",
      scheduledTime: "20:00",
      status: "scheduled",
      week: 1,
    }];

    const activeHtml = renderToStaticMarkup(createElement(AdminMatchesClient, {
      data,
      isSuperAdmin: false,
    }));

    expect(activeHtml).toContain(">Edit<");
    expect(activeHtml).toContain("Archive");

    data.matches = data.matches.map((match) => ({
      ...match,
      deletionScheduledAt: "2026-08-09T00:00:00Z",
    }));
    const html = renderToStaticMarkup(createElement(AdminMatchesClient, {
      data,
      isSuperAdmin: false,
    }));

    expect(html).not.toContain(">Edit<");
    expect(html).not.toContain("Archive");
    expect(html).not.toContain("Unarchive");
    expect(html).not.toContain("Schedule Delete");
    expect(html).not.toContain("Pending Delete");
  });
});
