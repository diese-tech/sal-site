import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LeagueData } from "@/types/league";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) =>
    createElement("a", props, children),
}));

import { AdminPlayersClient } from "@/components/admin/AdminPlayersClient";

function leagueData(): LeagueData {
  return {
    season: { id: "season-1", name: "Season One", status: "pre-season", isCurrent: true, startDate: "2026-01-01", endDate: "2026-06-01", currentWeek: 0 },
    divisions: [],
    orgs: [],
    players: [],
    matches: [],
    standings: [],
    announcements: [],
    lastUpdated: new Date().toISOString(),
  };
}

function renderPlayers(isSuperAdmin: boolean) {
  return renderToStaticMarkup(createElement(AdminPlayersClient, { data: leagueData(), isSuperAdmin }));
}

describe("AdminPlayersClient season-roster callout", () => {
  it("explains that a returning org should be enrolled, not recreated, for every admin", () => {
    const html = renderPlayers(false);
    expect(html).toContain("enrolled into the season, not recreated here");
  });

  it("links to the current season's Manage Roster page for a super admin", () => {
    const html = renderPlayers(true);
    expect(html).toContain('href="/admin/seasons/season-1/roster"');
    expect(html).toContain("Manage Season One Roster");
  });

  it("omits the Manage Roster link for a non-super-admin and explains who can enroll", () => {
    const html = renderPlayers(false);
    expect(html).not.toContain('href="/admin/seasons/season-1/roster"');
    expect(html).toContain("A super admin performs season enrollment");
  });
});
