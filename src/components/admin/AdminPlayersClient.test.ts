import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LeagueData, LeaguePlayer, Org } from "@/types/league";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) =>
    createElement("a", props, children),
}));

import {
  AdminPlayersClient,
  canApplyPlayerMerge,
  getPlayerMergeTargets,
  PlayerMergePreviewSummary,
  playerMergeSuccessMessage,
} from "@/components/admin/AdminPlayersClient";

function player(overrides: Partial<LeaguePlayer> = {}): LeaguePlayer {
  return {
    id: "player-source",
    ign: "Pringle Imperialist",
    discordUsername: "pringleimperialist",
    primaryRole: "Support",
    secondaryRoles: [],
    status: "free-agent",
    isStarter: false,
    isCaptain: false,
    avatarInitials: "PI",
    avatarGradient: "from-cyan-500 to-blue-500",
    ...overrides,
  };
}

function org(overrides: Partial<Org> = {}): Org {
  return {
    id: "org-spicy",
    name: "Something Spicy",
    tag: "SS",
    divisionId: "terra",
    logoInitials: "SS",
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

function renderPlayers(
  isSuperAdmin: boolean,
  overrides: Partial<LeagueData> = {},
  initialMergePlayerId?: string,
) {
  return renderToStaticMarkup(createElement(AdminPlayersClient, {
    data: { ...leagueData(), ...overrides },
    isSuperAdmin,
    initialMergePlayerId,
  }));
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

  it("links a regular admin to the current season roster", () => {
    const html = renderPlayers(false);
    expect(html).toContain('href="/admin/seasons/season-1/roster"');
    expect(html).toContain("Manage Season One Roster");
    expect(html).not.toContain("A super admin performs season enrollment");
  });

  it("shows an explicit merge action only to superadmins", () => {
    const data = { players: [player()] };

    expect(renderPlayers(true, data)).toContain("Merge Duplicate");
    expect(renderPlayers(false, data)).not.toContain("Merge Duplicate");
    expect(renderPlayers(false, data, "player-source")).not.toContain("Merge duplicate player");
  });

  it("opens a deep-linked merge with active, available canonical choices", () => {
    const players = [
      player(),
      player({
        id: "player-target",
        orgId: "org-spicy",
        divisionId: "terra",
        isCaptain: true,
        status: "org-affiliated",
        profileClaimed: true,
        hasDiscordId: true,
      }),
      player({ id: "player-archived", ign: "Archived", archivedAt: "2026-08-01T00:00:00Z" }),
      player({ id: "player-pending", ign: "Pending", deletionScheduledAt: "2026-08-01T00:00:00Z" }),
    ];

    const html = renderPlayers(true, { players, orgs: [org()] }, "player-source");
    const mergePanel = html.slice(html.indexOf("Merge duplicate player"), html.indexOf("Editing:"));

    expect(mergePanel).toContain("player-target");
    expect(mergePanel).toContain("Something Spicy");
    expect(mergePanel).toContain("Terra");
    expect(mergePanel).toContain("Captain");
    expect(mergePanel).toContain("Claimed");
    expect(mergePanel).toContain("Discord linked");
    expect(mergePanel).not.toContain('value="player-source"');
    expect(mergePanel).not.toContain("player-archived");
    expect(mergePanel).not.toContain("player-pending");
  });
});

describe("player merge safeguards", () => {
  const preview = {
    source: {
      id: "player-source",
      ign: "Duplicate",
      discordUsername: "duplicate",
      orgId: null,
      divisionId: null,
      status: "free-agent",
      isCaptain: false,
      isStarter: false,
      profileClaimed: true,
      hasDiscordId: true,
      archivedAt: null,
    },
    target: {
      id: "player-target",
      ign: "Canonical",
      discordUsername: "canonical",
      orgId: "org-spicy",
      divisionId: "terra",
      status: "org-affiliated",
      isCaptain: true,
      isStarter: true,
      profileClaimed: false,
      hasDiscordId: false,
      archivedAt: null,
    },
    counts: { seasonRosters: 2, playerMatchStats: 4 },
    blockers: [],
    blockerCodes: [],
    canMerge: true,
  };

  it("filters the source, archived, and pending-delete players from canonical choices", () => {
    const targets = getPlayerMergeTargets([
      player(),
      player({ id: "player-target" }),
      player({ id: "player-archived", archivedAt: "2026-08-01T00:00:00Z" }),
      player({ id: "player-pending", deletionScheduledAt: "2026-08-01T00:00:00Z" }),
    ], "player-source");

    expect(targets.map((candidate) => candidate.id)).toEqual(["player-target"]);
  });

  it("renders both identities, affected counts, account state, and database blockers", () => {
    const html = renderToStaticMarkup(createElement(PlayerMergePreviewSummary, {
      preview: {
        ...preview,
        blockers: ["Both identities captain competing roster assignments."],
        blockerCodes: ["COMPETING_CAPTAINS"],
        canMerge: false,
      },
      orgs: [org()],
    }));

    expect(html).toContain("Duplicate");
    expect(html).toContain("Canonical");
    expect(html).toContain("Roster assignments");
    expect(html).toContain("Match-report stats");
    expect(html).toContain("Discord linked");
    expect(html).toContain("Captain");
    expect(html).toContain("Both identities captain competing roster assignments.");
  });

  it("requires a mergeable preview, matching identities, and exact MERGE confirmation", () => {
    expect(canApplyPlayerMerge(preview, "player-source", "player-target", "merge")).toBe(false);
    expect(canApplyPlayerMerge({ ...preview, canMerge: false }, "player-source", "player-target", "MERGE")).toBe(false);
    expect(canApplyPlayerMerge(preview, "player-source", "different-target", "MERGE")).toBe(false);
    expect(canApplyPlayerMerge(preview, "player-source", "player-target", "MERGE")).toBe(true);
  });

  it("reports applied and idempotent success without implying a second merge", () => {
    expect(playerMergeSuccessMessage("Duplicate", "Canonical", "merged")).toBe("Merged Duplicate into Canonical.");
    expect(playerMergeSuccessMessage("Duplicate", "Canonical", "already_merged")).toBe(
      "Duplicate was already merged into Canonical.",
    );
    expect(playerMergeSuccessMessage(
      "Duplicate",
      "Canonical",
      "already_merged",
      "Players were merged, but league data could not be refreshed.",
    )).toBe(
      "Duplicate was already merged into Canonical. Players were merged, but league data could not be refreshed.",
    );
  });
});
