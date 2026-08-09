import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LeagueData } from "@/types/league";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) =>
    createElement("a", props, children),
}));

import { AdminTeamsClient, OrganizationMergePreviewSummary } from "@/components/admin/AdminTeamsClient";
import type { Org } from "@/types/league";

function org(overrides: Partial<Org> = {}): Org {
  return {
    id: "org-source",
    name: "Grizzlies",
    tag: "GRR",
    divisionId: "terra",
    logoInitials: "GRR",
    logoGradient: "from-cyan-500 to-blue-500",
    primaryColor: "#22d3ee",
    accentGradient: "from-cyan-500 to-blue-500",
    ...overrides,
  };
}

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

function renderTeams(isSuperAdmin: boolean, overrides: Partial<LeagueData> = {}, initialMergeOrgId?: string) {
  return renderToStaticMarkup(createElement(AdminTeamsClient, {
    data: { ...leagueData(), ...overrides },
    isSuperAdmin,
    initialMergeOrgId,
  }));
}

describe("AdminTeamsClient season-roster callout", () => {
  it("explains that a returning team should be enrolled, not recreated, for every admin", () => {
    const html = renderTeams(false);
    expect(html).toContain("enrolled into the season, not recreated");
  });

  it("links to the current season's Manage Roster page for a super admin", () => {
    const html = renderTeams(true);
    expect(html).toContain('href="/admin/seasons/season-1/roster"');
    expect(html).toContain("Manage Season One Roster");
  });

  it("omits the Manage Roster link for a non-super-admin and explains who can enroll", () => {
    const html = renderTeams(false);
    expect(html).not.toContain('href="/admin/seasons/season-1/roster"');
    expect(html).toContain("A super admin performs season enrollment");
  });

  it("shows explicit edit and merge actions instead of hiding editing behind the identity row", () => {
    const html = renderTeams(true, { orgs: [org()] });

    expect(html).toContain(">Edit<");
    expect(html).toContain("Merge Duplicate");
  });

  it("opens a deep-linked merge and excludes the source and unavailable orgs from canonical targets", () => {
    const html = renderTeams(true, {
      orgs: [
        org(),
        org({ id: "org-target", divisionId: "solar" }),
        org({ id: "org-archived", name: "Archived", archivedAt: "2026-08-01T00:00:00Z" }),
        org({ id: "org-pending", name: "Pending", deletionScheduledAt: "2026-08-01T00:00:00Z" }),
      ],
    }, "org-source");

    const mergePanel = html.slice(html.indexOf("Merge duplicate organization"), html.indexOf("Editing:"));
    expect(mergePanel).toContain("org-target");
    expect(mergePanel).not.toContain('value="org-source"');
    expect(mergePanel).not.toContain("org-archived");
    expect(mergePanel).not.toContain("org-pending");
  });

  it("renders affected counts and blockers from the database preview", () => {
    const html = renderToStaticMarkup(createElement(OrganizationMergePreviewSummary, {
      preview: {
        source: { id: "org-source", name: "Duplicate", tag: "DUP", divisionId: "terra" },
        target: { id: "org-target", name: "Canonical", tag: "CAN", divisionId: "solar" },
        counts: { seasonTeams: 1, matches: 2 },
        blockers: ["Source and target oppose each other in a match."],
        canMerge: false,
      },
    }));

    expect(html).toContain("Season teams");
    expect(html).toContain("Matches");
    expect(html).toContain("Source and target oppose each other in a match.");
  });
});
