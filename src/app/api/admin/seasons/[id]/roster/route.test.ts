import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  revalidateTag,
  saveSeasonOrgAssignment,
  saveSeasonRosterAssignment,
  removeSeasonOrgAssignment,
  removeSeasonRosterAssignment,
} = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  saveSeasonOrgAssignment: vi.fn(),
  saveSeasonRosterAssignment: vi.fn(),
  removeSeasonOrgAssignment: vi.fn(),
  removeSeasonRosterAssignment: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag }));
vi.mock("@/lib/league-data", () => ({
  saveSeasonOrgAssignment,
  saveSeasonRosterAssignment,
  removeSeasonOrgAssignment,
  removeSeasonRosterAssignment,
}));

import { makeAdminSession } from "@/lib/admin-auth";
import { DELETE, POST } from "./route";

function adminRequest(method: "POST" | "DELETE", body: unknown, role: "admin" | "super_admin" = "admin") {
  const session = makeAdminSession(`route-${role}`, role);
  return new NextRequest("http://localhost/api/admin/seasons/s2/roster", {
    method,
    headers: {
      "content-type": "application/json",
      cookie: `sal_admin_session=${session}`,
    },
    body: JSON.stringify(body),
  });
}

describe("season roster admin authorization", () => {
  beforeEach(() => {
    process.env.ADMIN_SESSION_SECRET = "season-roster-route-test-secret";
    vi.clearAllMocks();
  });

  it("allows a regular admin to enroll a divisional organization team", async () => {
    const response = await POST(
      adminRequest("POST", { entity: "org", orgId: "org-1", divisionId: "terra" }),
      { params: Promise.resolve({ id: "s2" }) },
    );

    expect(response.status).toBe(200);
    expect(saveSeasonOrgAssignment).toHaveBeenCalledWith("s2", "org-1", "terra");
    expect(revalidateTag).toHaveBeenCalledWith("league-data", {});
  });

  it("allows a regular admin to remove a season roster assignment without deleting the player", async () => {
    const response = await DELETE(
      adminRequest("DELETE", { entity: "player", playerId: "player-1" }),
      { params: Promise.resolve({ id: "s2" }) },
    );

    expect(response.status).toBe(200);
    expect(removeSeasonRosterAssignment).toHaveBeenCalledWith("s2", "player-1");
  });

  it("rejects an unauthenticated roster mutation", async () => {
    const request = new NextRequest("http://localhost/api/admin/seasons/s2/roster", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entity: "org", orgId: "org-1", divisionId: "terra" }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: "s2" }) });

    expect(response.status).toBe(403);
    expect(saveSeasonOrgAssignment).not.toHaveBeenCalled();
  });
});
