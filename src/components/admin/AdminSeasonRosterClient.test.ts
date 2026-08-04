import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Division, DivisionId, LeaguePlayer, Org, Season } from "@/types/league";
import type {
  SeasonOrgAdminAssignment,
  SeasonRosterAdminAssignment,
  SeasonRosterAdminData,
} from "@/lib/league-data";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  AdminSeasonRosterClient,
  orgRowFormState,
  orgRowSyncKey,
  playerRowFormState,
  playerRowSyncKey,
} from "@/components/admin/AdminSeasonRosterClient";

function division(id: DivisionId): Division {
  return { id, name: id.charAt(0).toUpperCase() + id.slice(1), description: "", tier: 1, accentColor: "#000" };
}

function org(overrides: Partial<Org> = {}): Org {
  return {
    id: "org-1",
    name: "Returning Org",
    tag: "RET",
    divisionId: "terra",
    logoInitials: "RO",
    logoGradient: "from-cyan-500 to-blue-500",
    primaryColor: "#22d3ee",
    accentGradient: "from-cyan-500 to-blue-500",
    ...overrides,
  };
}

function player(overrides: Partial<LeaguePlayer> = {}): LeaguePlayer {
  return {
    id: "player-1",
    discordUsername: "someplayer",
    ign: "SomePlayer",
    avatarInitials: "SP",
    avatarGradient: "from-cyan-500 to-blue-500",
    primaryRole: "Support",
    secondaryRoles: [],
    isStarter: false,
    isCaptain: false,
    status: "free-agent",
    ...overrides,
  };
}

function orgAssignment(overrides: Partial<SeasonOrgAdminAssignment> = {}): SeasonOrgAdminAssignment {
  return { org_id: "org-1", division_id: "terra", status: "active", ...overrides };
}

function rosterAssignment(overrides: Partial<SeasonRosterAdminAssignment> = {}): SeasonRosterAdminAssignment {
  return { player_id: "player-1", org_id: "org-1", division_id: "terra", is_captain: false, roster_status: "active", ...overrides };
}

function season(overrides: Partial<Season> = {}): Season {
  return { id: "season-1", name: "Season One", status: "pre-season", isCurrent: true, startDate: "2026-01-01", endDate: "2026-06-01", currentWeek: 0, ...overrides };
}

describe("orgRowFormState / orgRowSyncKey", () => {
  it("falls back to the org's own division when there is no season assignment", () => {
    expect(orgRowFormState(org({ divisionId: "lunar" }), undefined)).toEqual({ divisionId: "lunar" });
  });

  it("uses the season assignment's division when enrolled", () => {
    expect(orgRowFormState(org({ divisionId: "lunar" }), orgAssignment({ division_id: "solar" }))).toEqual({ divisionId: "solar" });
  });

  it("sync key changes when the assignment's division changes", () => {
    const before = orgRowSyncKey(orgAssignment({ division_id: "terra" }));
    const after = orgRowSyncKey(orgAssignment({ division_id: "solar" }));
    expect(before).not.toEqual(after);
  });

  it("sync key is stable for an unchanged assignment", () => {
    expect(orgRowSyncKey(orgAssignment({ division_id: "terra" }))).toEqual(orgRowSyncKey(orgAssignment({ division_id: "terra" })));
  });

  it("sync key differs between enrolled and unenrolled", () => {
    expect(orgRowSyncKey(undefined)).not.toEqual(orgRowSyncKey(orgAssignment()));
  });
});

describe("playerRowFormState / playerRowSyncKey", () => {
  it("falls back to the player's own division and unassigned/no-captain when there is no season assignment", () => {
    expect(playerRowFormState(player({ divisionId: "lunar" }), undefined)).toEqual({
      orgId: "",
      freeAgentDivision: "lunar",
      isCaptain: false,
    });
  });

  it("maps org, division, and captain flag from the season assignment", () => {
    expect(playerRowFormState(player(), rosterAssignment({ org_id: "org-9", division_id: "solar", is_captain: true }))).toEqual({
      orgId: "org-9",
      freeAgentDivision: "solar",
      isCaptain: true,
    });
  });

  it("sync key changes when captain status changes -- this is the server-confirmed-state-replaces-stale-local-state fix", () => {
    const before = playerRowSyncKey(rosterAssignment({ is_captain: true }));
    const after = playerRowSyncKey(rosterAssignment({ is_captain: false }));
    expect(before).not.toEqual(after);
  });

  it("sync key changes when org changes", () => {
    const before = playerRowSyncKey(rosterAssignment({ org_id: "org-1" }));
    const after = playerRowSyncKey(rosterAssignment({ org_id: "org-2" }));
    expect(before).not.toEqual(after);
  });

  it("sync key is stable for an unchanged assignment", () => {
    expect(playerRowSyncKey(rosterAssignment())).toEqual(playerRowSyncKey(rosterAssignment()));
  });
});

function renderRoster(data: SeasonRosterAdminData) {
  return renderToStaticMarkup(createElement(AdminSeasonRosterClient, { data }));
}

describe("AdminSeasonRosterClient render", () => {
  it("separates enrolled orgs from available returning orgs and labels enrollment", () => {
    const data: SeasonRosterAdminData = {
      season: season(),
      divisions: [division("terra"), division("solar"), division("lunar")],
      orgCatalog: [org({ id: "org-enrolled", name: "Enrolled Org" }), org({ id: "org-available", name: "Available Org" })],
      playerCatalog: [],
      orgAssignments: [orgAssignment({ org_id: "org-enrolled" })],
      rosterAssignments: [],
    };

    const html = renderRoster(data);

    expect(html).toContain("Enrolled in Season One (1)");
    expect(html).toContain("Available Returning Orgs (1)");
    expect(html).toContain("Enrolled Org");
    expect(html).toContain("Available Org");
    expect(html).toContain("Enroll Returning Org");
    // The enrolled org's row renders "Save", not "Enroll Returning Org".
    const enrolledSectionAndAfter = html.slice(html.indexOf("Enrolled in Season One"));
    const availableSectionStart = enrolledSectionAndAfter.indexOf("Available Returning Orgs");
    expect(enrolledSectionAndAfter.slice(0, availableSectionStart)).toContain(">Save<");
  });

  it("renders empty states for an empty org catalog", () => {
    const data: SeasonRosterAdminData = {
      season: season(),
      divisions: [division("terra")],
      orgCatalog: [],
      playerCatalog: [],
      orgAssignments: [],
      rosterAssignments: [],
    };

    const html = renderRoster(data);

    expect(html).toContain("No orgs enrolled yet. Enroll returning orgs from the list below.");
    expect(html).toContain("Every org in the catalog is enrolled in this season.");
  });

  it("explains that returning orgs are enrolled, not recreated", () => {
    const data: SeasonRosterAdminData = {
      season: season(),
      divisions: [],
      orgCatalog: [],
      playerCatalog: [],
      orgAssignments: [],
      rosterAssignments: [],
    };

    const html = renderRoster(data);

    expect(html).toContain("enroll it");
    expect(html).toContain("don&#x27;t recreate it");
  });
});

// Not covered here (needs interaction the SSR-only vitest harness cannot express --
// see the plan's "Tests I want but cannot add" section and the comment left on
// diese-tech/sal-site PR #239):
//   1. Clicking "Enroll Returning Org" moves the org into the Enrolled section after refresh.
//   2. Reassigning captain from player A to player B clears A's captain checkbox after refresh,
//      without a manual reload -- this is the scenario PR #239's captain-clearing write enables.
//   3. Changing a row's org/division re-syncs its selects after a *different* row's save triggers
//      router.refresh().
// These need a real DOM + interaction harness (jsdom/@testing-library) or a Playwright spec.
