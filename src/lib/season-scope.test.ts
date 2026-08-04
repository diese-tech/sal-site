import { describe, expect, it } from "vitest";
import type { LeaguePlayer, Org } from "@/types/league";
import { mergeSeasonAndCatalogOrgs, mergeSeasonAndCatalogPlayers, scopeSeasonEntities } from "./season-scope";

const org: Org = {
  id: "org-old",
  name: "Old Organization",
  tag: "OLD",
  divisionId: "lunar",
  logoInitials: "OO",
  logoGradient: "from-black to-white",
  primaryColor: "#000000",
  accentGradient: "from-black to-white",
};

const player: LeaguePlayer = {
  id: "player-old",
  orgId: "org-old",
  discordUsername: "old-player",
  ign: "Old Player",
  avatarInitials: "OP",
  avatarGradient: "from-black to-white",
  primaryRole: "Support",
  secondaryRoles: [],
  isStarter: true,
  isCaptain: true,
  divisionId: "lunar",
  status: "active",
};

describe("scopeSeasonEntities", () => {
  it("makes a newly created season visually empty without deleting global identities", () => {
    const scoped = scopeSeasonEntities([org], [player], [], []);

    expect(scoped).toEqual({ orgs: [], players: [] });
    expect(org.id).toBe("org-old");
    expect(player.id).toBe("player-old");
  });

  it("uses season-specific division, organization, and captain assignments", () => {
    const scoped = scopeSeasonEntities(
      [org],
      [{ ...player, orgId: undefined, divisionId: undefined, isCaptain: false }],
      [{ org_id: "org-old", division_id: "solar" }],
      [{
        player_id: "player-old",
        org_id: "org-old",
        division_id: "solar",
        is_captain: true,
      }],
    );

    expect(scoped.orgs[0]).toMatchObject({ divisionId: "solar", captainId: "player-old" });
    expect(scoped.players[0]).toMatchObject({
      orgId: "org-old",
      divisionId: "solar",
      isCaptain: true,
    });
  });

  it("materializes separate divisional teams and captains for one organization", () => {
    const lunarCaptain = { ...player, id: "captain-lunar", divisionId: "lunar" as const };
    const solarCaptain = { ...player, id: "captain-solar", divisionId: "solar" as const };
    const scoped = scopeSeasonEntities(
      [org],
      [lunarCaptain, solarCaptain],
      [
        { org_id: "org-old", division_id: "lunar" },
        { org_id: "org-old", division_id: "solar" },
      ],
      [
        { player_id: "captain-lunar", org_id: "org-old", division_id: "lunar", is_captain: true },
        { player_id: "captain-solar", org_id: "org-old", division_id: "solar", is_captain: true },
      ],
    );

    expect(scoped.orgs).toEqual([
      expect.objectContaining({ id: "org-old", divisionId: "lunar", captainId: "captain-lunar" }),
      expect.objectContaining({ id: "org-old", divisionId: "solar", captainId: "captain-solar" }),
    ]);
  });
});

describe("mergeSeasonAndCatalogOrgs", () => {
  it("keeps every season-scoped divisional team for an org fielding multiple divisions", () => {
    const lunarTeam = { ...org, divisionId: "lunar" as const };
    const solarTeam = { ...org, divisionId: "solar" as const };
    const terraTeam = { ...org, divisionId: "terra" as const };

    const merged = mergeSeasonAndCatalogOrgs([lunarTeam, solarTeam, terraTeam], [{ ...org, divisionId: "terra" }]);

    expect(merged).toEqual([lunarTeam, solarTeam, terraTeam]);
  });

  it("adds catalog orgs that have no season enrollment yet, without duplicating enrolled ones", () => {
    const seasonTeam = { ...org, divisionId: "solar" as const };
    const unenrolledOrg: Org = { ...org, id: "org-new", name: "Brand New Org", divisionId: "terra" };

    const merged = mergeSeasonAndCatalogOrgs([seasonTeam], [{ ...org, divisionId: "terra" }, unenrolledOrg]);

    expect(merged).toEqual([seasonTeam, unenrolledOrg]);
  });
});

describe("mergeSeasonAndCatalogPlayers", () => {
  it("prefers the season-scoped org/division/captain state over the stale flat catalog row", () => {
    const seasonPlayer = { ...player, orgId: "org-old", divisionId: "solar" as const, isCaptain: true };
    const catalogPlayer = { ...player, orgId: "org-old", divisionId: "lunar" as const, isCaptain: false };

    const merged = mergeSeasonAndCatalogPlayers([seasonPlayer], [catalogPlayer]);

    expect(merged).toEqual([seasonPlayer]);
  });

  it("adds catalog players who have no roster row this season", () => {
    const seasonPlayer = { ...player, id: "player-rostered" };
    const freeAgent: LeaguePlayer = { ...player, id: "player-free-agent", orgId: undefined, divisionId: undefined, isCaptain: false };

    const merged = mergeSeasonAndCatalogPlayers([seasonPlayer], [{ ...player, id: "player-rostered" }, freeAgent]);

    expect(merged).toEqual([seasonPlayer, freeAgent]);
  });
});
