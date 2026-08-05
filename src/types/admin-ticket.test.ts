import { describe, expect, it } from "vitest";
import { capabilitiesForAdminRole } from "@/types/admin-ticket";

describe("capabilitiesForAdminRole", () => {
  it.each(["admin", "super_admin"] as const)(
    "lets the %s role view the queue and act on Wave 1 tickets, matching the admin-session check on the action endpoints",
    (role) => {
      expect(capabilitiesForAdminRole(role)).toEqual({
        canViewQueue: true,
        canActOnTickets: true,
        canViewRestrictedIdentities: false,
      });
    },
  );

  it.each(["admin", "super_admin"] as const)(
    "keeps restricted identities hidden from %s until an audited reveal path exists",
    (role) => {
      expect(capabilitiesForAdminRole(role).canViewRestrictedIdentities).toBe(false);
    },
  );

  it.each(["owner", "moderator", "division_commissioner", "", null, undefined] as const)(
    "denies everything for unrecognized role %j",
    (role) => {
      expect(capabilitiesForAdminRole(role)).toEqual({
        canViewQueue: false,
        canActOnTickets: false,
        canViewRestrictedIdentities: false,
      });
    },
  );

  it("keeps password-only sessions read-only because they have no audited Discord actor", () => {
    expect(capabilitiesForAdminRole("super_admin", "password-admin")).toEqual({
      canViewQueue: true,
      canActOnTickets: false,
      canViewRestrictedIdentities: false,
    });
  });
});
