import { describe, expect, it } from "vitest";
import { capabilitiesForAdminRole } from "@/types/admin-ticket";

describe("capabilitiesForAdminRole", () => {
  it.each(["admin", "super_admin"] as const)(
    "temporarily allows the current %s role to act on Wave 1 tickets",
    (role) => {
      expect(capabilitiesForAdminRole(role)).toEqual({
        canViewQueue: true,
        canActOnTickets: true,
        canViewRestrictedIdentities: false,
      });
    },
  );
});
