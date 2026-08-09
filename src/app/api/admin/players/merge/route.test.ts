import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PlayerMergeContractError } from "@/lib/player-merge";
import { createPlayerMergeHandler } from "./route";

const preview = {
  source: {
    id: "player-source",
    ign: "Pringle Imperialist",
    discordUsername: "pringleimperialist",
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
    ign: "Pringle Imperialist",
    discordUsername: "pringleimperialist",
    orgId: "org-spicy",
    divisionId: "terra",
    status: "org-affiliated",
    isCaptain: true,
    isStarter: true,
    profileClaimed: false,
    hasDiscordId: false,
    archivedAt: null,
  },
  counts: { seasonRosters: 1, registrations: 1, playerMatchStats: 0 },
  blockers: [],
  blockerCodes: [],
  canMerge: true,
};

function request(body: unknown) {
  return new NextRequest("https://sal.example/api/admin/players/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    getSession: () => ({ discordId: "super-1", role: "super_admin" as const }),
    previewMerge: vi.fn().mockResolvedValue(preview),
    applyMerge: vi.fn(),
    revalidateLeagueData: vi.fn(),
    ...overrides,
  };
}

describe("POST /api/admin/players/merge", () => {
  it("rejects non-superadmins before invoking the database", async () => {
    const previewMerge = vi.fn();
    const handler = createPlayerMergeHandler(dependencies({
      getSession: () => ({ discordId: "admin-1", role: "admin" }),
      previewMerge,
    }));

    const response = await handler(request({
      action: "preview",
      sourcePlayerId: "player-source",
      targetPlayerId: "player-target",
    }));

    expect(response.status).toBe(403);
    expect(previewMerge).not.toHaveBeenCalled();
  });

  it("returns a validated preview for distinct player identities", async () => {
    const previewMerge = vi.fn().mockResolvedValue(preview);
    const handler = createPlayerMergeHandler(dependencies({ previewMerge }));

    const response = await handler(request({
      action: "preview",
      sourcePlayerId: "player-source",
      targetPlayerId: "player-target",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, preview });
    expect(previewMerge).toHaveBeenCalledWith("player-source", "player-target");
  });

  it.each([
    [{ action: "preview", sourcePlayerId: "same", targetPlayerId: "same" }],
    [{ action: "apply", sourcePlayerId: "source", targetPlayerId: "target", confirmation: "merge" }],
    [{ action: "preview", sourcePlayerId: "", targetPlayerId: "target" }],
  ])("rejects invalid input without invoking an RPC", async (body) => {
    const previewMerge = vi.fn();
    const applyMerge = vi.fn();
    const handler = createPlayerMergeHandler(dependencies({ previewMerge, applyMerge }));

    const response = await handler(request(body));

    expect(response.status).toBe(400);
    expect(previewMerge).not.toHaveBeenCalled();
    expect(applyMerge).not.toHaveBeenCalled();
  });

  it("applies a confirmed merge with the acting Discord ID and revalidates league data", async () => {
    const result = {
      code: "merged" as const,
      applied: true as const,
      sourcePlayerId: "player-source",
      targetPlayerId: "player-target",
      source: preview.source,
      target: preview.target,
      counts: preview.counts,
    };
    const applyMerge = vi.fn().mockResolvedValue(result);
    const revalidateLeagueData = vi.fn();
    const handler = createPlayerMergeHandler(dependencies({ applyMerge, revalidateLeagueData }));

    const response = await handler(request({
      action: "apply",
      sourcePlayerId: "player-source",
      targetPlayerId: "player-target",
      confirmation: "MERGE",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, ...result, warning: null });
    expect(applyMerge).toHaveBeenCalledWith({
      sourcePlayerId: "player-source",
      targetPlayerId: "player-target",
      actorDiscordId: "super-1",
    });
    expect(revalidateLeagueData).toHaveBeenCalledOnce();
  });

  it("treats a retry result as successful and revalidates league data", async () => {
    const result = {
      code: "already_merged" as const,
      applied: false as const,
      sourcePlayerId: "player-source",
      targetPlayerId: "player-target",
    };
    const revalidateLeagueData = vi.fn();
    const handler = createPlayerMergeHandler(dependencies({
      applyMerge: vi.fn().mockResolvedValue(result),
      revalidateLeagueData,
    }));

    const response = await handler(request({
      action: "apply",
      sourcePlayerId: "player-source",
      targetPlayerId: "player-target",
      confirmation: "MERGE",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, ...result, warning: null });
    expect(revalidateLeagueData).toHaveBeenCalledOnce();
  });

  it("reports a cache warning without implying the committed merge failed", async () => {
    const result = {
      code: "merged" as const,
      applied: true as const,
      sourcePlayerId: "player-source",
      targetPlayerId: "player-target",
      source: preview.source,
      target: preview.target,
      counts: preview.counts,
    };
    const handler = createPlayerMergeHandler(dependencies({
      applyMerge: vi.fn().mockResolvedValue(result),
      revalidateLeagueData: vi.fn(() => { throw new Error("cache unavailable"); }),
    }));

    const response = await handler(request({
      action: "apply",
      sourcePlayerId: "player-source",
      targetPlayerId: "player-target",
      confirmation: "MERGE",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      code: "merged",
      warning: "Players were merged, but league data could not be refreshed.",
    });
  });

  it.each(["23514", "23505", "40001", "22023"])("maps database conflict %s to 409", async (code) => {
    const error = Object.assign(new Error("Player merge blocked"), { code });
    const handler = createPlayerMergeHandler(dependencies({
      previewMerge: vi.fn().mockRejectedValue(error),
    }));

    const response = await handler(request({
      action: "preview",
      sourcePlayerId: "player-source",
      targetPlayerId: "player-target",
    }));

    expect(response.status).toBe(409);
  });

  it("maps an invalid database contract to 502", async () => {
    const handler = createPlayerMergeHandler(dependencies({
      previewMerge: vi.fn().mockRejectedValue(new PlayerMergeContractError("Invalid merge response")),
    }));

    const response = await handler(request({
      action: "preview",
      sourcePlayerId: "player-source",
      targetPlayerId: "player-target",
    }));

    expect(response.status).toBe(502);
  });
});
