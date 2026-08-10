import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  revalidateTag,
  savePlayerForCurrentSeason,
  saveOrgForCurrentSeason,
  archiveRecord,
  unarchiveRecord,
  CaptainReassignmentConfirmationError,
} = vi.hoisted(() => {
  class CaptainReassignmentConfirmationError extends Error {}
  return {
    revalidateTag: vi.fn(),
    savePlayerForCurrentSeason: vi.fn(),
    saveOrgForCurrentSeason: vi.fn(),
    archiveRecord: vi.fn(),
    unarchiveRecord: vi.fn(),
    CaptainReassignmentConfirmationError,
  };
});

vi.mock("next/cache", () => ({ revalidateTag }));
vi.mock("@/lib/league-data", () => ({
  savePlayerForCurrentSeason,
  saveOrgForCurrentSeason,
  archiveRecord,
  unarchiveRecord,
  CaptainReassignmentConfirmationError,
}));

import { makeAdminSession } from "@/lib/admin-auth";
import { POST as savePlayer } from "./players/route";
import { POST as saveOrg } from "./orgs/route";
import { POST as archivePlayer } from "./players/[id]/archive/route";
import { POST as archiveOrg } from "./orgs/[id]/archive/route";
import { POST as archiveMatch } from "./matches/[id]/archive/route";

type AdminRole = "admin" | "super_admin";

function request(url: string, body: unknown, role?: AdminRole) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (role) headers.cookie = `sal_admin_session=${makeAdminSession(`routine-${role}`, role)}`;
  return new NextRequest(url, { method: "POST", headers, body: JSON.stringify(body) });
}

const player = {
  id: "player-1",
  ign: "Player One",
  discordUsername: "playerone",
  primaryRole: "Mid",
  status: "active",
};

const org = {
  id: "org-1",
  name: "Organization One",
  tag: "ORG",
  divisionId: "terra",
};

const routeContexts = {
  player: { params: Promise.resolve({ id: "player-1" }) },
  org: { params: Promise.resolve({ id: "org-1" }) },
  match: { params: Promise.resolve({ id: "match-1" }) },
};

describe("routine admin API permissions", () => {
  beforeEach(() => {
    process.env.ADMIN_SESSION_SECRET = "routine-admin-route-test-secret";
    vi.clearAllMocks();
  });

  it("allows a regular admin to save a player", async () => {
    const response = await savePlayer(request("http://localhost/api/admin/players", player, "admin"));

    expect(response.status).toBe(200);
    expect(savePlayerForCurrentSeason).toHaveBeenCalledWith(
      expect.objectContaining(player),
      { confirmCaptainReassignment: undefined, actorDiscordId: "routine-admin" },
    );
  });

  it("rejects an unauthenticated player save", async () => {
    const response = await savePlayer(request("http://localhost/api/admin/players", player));

    expect(response.status).toBe(403);
    expect(savePlayerForCurrentSeason).not.toHaveBeenCalled();
  });

  it("returns a deliberate conflict when captain reassignment lacks confirmation", async () => {
    vi.mocked(savePlayerForCurrentSeason).mockRejectedValueOnce(new CaptainReassignmentConfirmationError(
      "Current-season captain reassignment requires explicit confirmation.",
    ));
    const response = await savePlayer(request("http://localhost/api/admin/players", { ...player, isCaptain: true }, "admin"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Current-season captain reassignment requires explicit confirmation.",
      confirmationRequired: true,
    });
  });

  it("accepts only a boolean player captain-reassignment confirmation", async () => {
    const invalid = await savePlayer(request(
      "http://localhost/api/admin/players",
      { ...player, isCaptain: true, confirmCaptainReassignment: "true" },
      "admin",
    ));
    const confirmed = await savePlayer(request(
      "http://localhost/api/admin/players",
      { ...player, isCaptain: true, confirmCaptainReassignment: true },
      "admin",
    ));

    expect(invalid.status).toBe(400);
    expect(confirmed.status).toBe(200);
    expect(savePlayerForCurrentSeason).toHaveBeenLastCalledWith(
      expect.objectContaining({ isCaptain: true }),
      { confirmCaptainReassignment: true, actorDiscordId: "routine-admin" },
    );
  });

  it("allows a regular admin to save an organization", async () => {
    const response = await saveOrg(request("http://localhost/api/admin/orgs", org, "admin"));

    expect(response.status).toBe(200);
    expect(saveOrgForCurrentSeason).toHaveBeenCalledWith(
      expect.objectContaining(org),
      { confirmCaptainReassignment: undefined, actorDiscordId: "routine-admin" },
    );
  });

  it("rejects an unauthenticated organization save", async () => {
    const response = await saveOrg(request("http://localhost/api/admin/orgs", org));

    expect(response.status).toBe(403);
    expect(saveOrgForCurrentSeason).not.toHaveBeenCalled();
  });

  it("returns a deliberate conflict when org captain reassignment lacks confirmation", async () => {
    vi.mocked(saveOrgForCurrentSeason).mockRejectedValueOnce(new CaptainReassignmentConfirmationError(
      "Current-season captain reassignment requires explicit confirmation.",
    ));
    const response = await saveOrg(request("http://localhost/api/admin/orgs", { ...org, captainId: "player-1" }, "admin"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Current-season captain reassignment requires explicit confirmation.",
      confirmationRequired: true,
    });
  });

  it("accepts only a boolean org captain-reassignment confirmation", async () => {
    const invalid = await saveOrg(request(
      "http://localhost/api/admin/orgs",
      { ...org, captainId: "player-1", confirmCaptainReassignment: "true" },
      "admin",
    ));
    const confirmed = await saveOrg(request(
      "http://localhost/api/admin/orgs",
      { ...org, captainId: "player-1", confirmCaptainReassignment: true },
      "admin",
    ));

    expect(invalid.status).toBe(400);
    expect(confirmed.status).toBe(200);
    expect(saveOrgForCurrentSeason).toHaveBeenLastCalledWith(
      expect.objectContaining({ captainId: "player-1" }),
      { confirmCaptainReassignment: true, actorDiscordId: "routine-admin" },
    );
  });

  it.each([
    ["player", archivePlayer, routeContexts.player, "players", "player-1"],
    ["organization", archiveOrg, routeContexts.org, "orgs", "org-1"],
    ["match", archiveMatch, routeContexts.match, "matches", "match-1"],
  ] as const)("allows a regular admin to archive and unarchive a %s", async (_label, handler, context, table, id) => {
    const archived = await handler(request(`http://localhost/api/admin/${table}/record/archive`, {}, "admin"), context);
    const restored = await handler(request(`http://localhost/api/admin/${table}/record/archive`, { unarchive: true }, "admin"), context);

    expect(archived.status).toBe(200);
    expect(restored.status).toBe(200);
    expect(archiveRecord).toHaveBeenCalledWith(table, id);
    expect(unarchiveRecord).toHaveBeenCalledWith(table, id);
  });

  it.each([
    ["player", archivePlayer, routeContexts.player, "players"],
    ["organization", archiveOrg, routeContexts.org, "orgs"],
    ["match", archiveMatch, routeContexts.match, "matches"],
  ] as const)("rejects an unauthenticated %s archive mutation", async (_label, handler, context, table) => {
    const response = await handler(request(`http://localhost/api/admin/${table}/record/archive`, {}), context);

    expect(response.status).toBe(403);
    expect(archiveRecord).not.toHaveBeenCalled();
    expect(unarchiveRecord).not.toHaveBeenCalled();
  });
});
