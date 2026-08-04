import { describe, expect, it } from "vitest";
import type { LeaguePlayer, Org } from "@/types/league";
import { scopeSeasonEntities } from "./season-scope";

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
