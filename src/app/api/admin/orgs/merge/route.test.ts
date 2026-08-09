import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { OrganizationMergeContractError } from "@/lib/organization-merge";
import { createOrganizationMergeHandler } from "./route";

const preview = {
  source: { id: "org-source", name: "Grizzlies", tag: "GRR", divisionId: "terra" },
  target: { id: "org-target", name: "Grizzlies", tag: "GRR", divisionId: "solar" },
  counts: { seasonTeams: 1, seasonRosters: 5, matches: 0 },
  blockers: [],
  canMerge: true,
};

function request(body: unknown) {
  return new NextRequest("https://sal.example/api/admin/orgs/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/orgs/merge", () => {
  it("rejects non-superadmins before invoking the database", async () => {
    const previewMerge = vi.fn();
    const handler = createOrganizationMergeHandler({
      getSession: () => ({ discordId: "admin-1", role: "admin" }),
      previewMerge,
      applyMerge: vi.fn(),
      recalculateStandings: vi.fn(),
      revalidateLeagueData: vi.fn(),
    });

    const response = await handler(request({ action: "preview", sourceOrgId: "org-source", targetOrgId: "org-target" }));

    expect(response.status).toBe(403);
    expect(previewMerge).not.toHaveBeenCalled();
  });

  it("returns the validated database preview", async () => {
    const previewMerge = vi.fn().mockResolvedValue(preview);
    const handler = createOrganizationMergeHandler({
      getSession: () => ({ discordId: "super-1", role: "super_admin" }),
      previewMerge,
      applyMerge: vi.fn(),
      recalculateStandings: vi.fn(),
      revalidateLeagueData: vi.fn(),
    });

    const response = await handler(request({ action: "preview", sourceOrgId: "org-source", targetOrgId: "org-target" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, preview });
    expect(previewMerge).toHaveBeenCalledWith("org-source", "org-target");
  });

  it("requires explicit MERGE confirmation before apply", async () => {
    const applyMerge = vi.fn();
    const handler = createOrganizationMergeHandler({
      getSession: () => ({ discordId: "super-1", role: "super_admin" }),
      previewMerge: vi.fn(),
      applyMerge,
      recalculateStandings: vi.fn(),
      revalidateLeagueData: vi.fn(),
    });

    const response = await handler(request({
      action: "apply",
      sourceOrgId: "org-source",
      targetOrgId: "org-target",
      confirmation: "merge",
    }));

    expect(response.status).toBe(400);
    expect(applyMerge).not.toHaveBeenCalled();
  });

  it("applies the merge, recalculates standings, and revalidates league data", async () => {
    const applyMerge = vi.fn().mockResolvedValue({
      code: "merged",
      applied: true,
      sourceOrganizationId: "org-source",
      targetOrganizationId: "org-target",
      source: preview.source,
      target: preview.target,
      counts: preview.counts,
    });
    const recalculateStandings = vi.fn().mockResolvedValue([]);
    const revalidateLeagueData = vi.fn();
    const handler = createOrganizationMergeHandler({
      getSession: () => ({ discordId: "super-1", role: "super_admin" }),
      previewMerge: vi.fn(),
      applyMerge,
      recalculateStandings,
      revalidateLeagueData,
    });

    const response = await handler(request({
      action: "apply",
      sourceOrgId: "org-source",
      targetOrgId: "org-target",
      confirmation: "MERGE",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, code: "merged", warning: null });
    expect(applyMerge).toHaveBeenCalledWith({
      sourceOrgId: "org-source",
      targetOrgId: "org-target",
      actorDiscordId: "super-1",
    });
    expect(recalculateStandings).toHaveBeenCalledOnce();
    expect(revalidateLeagueData).toHaveBeenCalledOnce();
  });

  it("reports a standings warning without claiming the committed merge failed", async () => {
    const applyMerge = vi.fn().mockResolvedValue({
      code: "already_merged",
      applied: false,
      sourceOrganizationId: "org-source",
      targetOrganizationId: "org-target",
    });
    const handler = createOrganizationMergeHandler({
      getSession: () => ({ discordId: "super-1", role: "super_admin" }),
      previewMerge: vi.fn(),
      applyMerge,
      recalculateStandings: vi.fn().mockRejectedValue(new Error("standings unavailable")),
      revalidateLeagueData: vi.fn(),
    });

    const response = await handler(request({
      action: "apply",
      sourceOrgId: "org-source",
      targetOrgId: "org-target",
      confirmation: "MERGE",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      code: "already_merged",
      warning: "Organizations were merged, but standings could not be recalculated.",
    });
  });

  it("maps fail-closed database conflicts to 409", async () => {
    const error = Object.assign(new Error("Organization merge blocked"), { code: "23514" });
    const handler = createOrganizationMergeHandler({
      getSession: () => ({ discordId: "super-1", role: "super_admin" }),
      previewMerge: vi.fn().mockRejectedValue(error),
      applyMerge: vi.fn(),
      recalculateStandings: vi.fn(),
      revalidateLeagueData: vi.fn(),
    });

    const response = await handler(request({ action: "preview", sourceOrgId: "org-source", targetOrgId: "org-target" }));

    expect(response.status).toBe(409);
  });

  it("fails closed when the database response violates the pinned contract", async () => {
    const handler = createOrganizationMergeHandler({
      getSession: () => ({ discordId: "super-1", role: "super_admin" }),
      previewMerge: vi.fn().mockRejectedValue(new OrganizationMergeContractError("Invalid merge response")),
      applyMerge: vi.fn(),
      recalculateStandings: vi.fn(),
      revalidateLeagueData: vi.fn(),
    });

    const response = await handler(request({ action: "preview", sourceOrgId: "org-source", targetOrgId: "org-target" }));

    expect(response.status).toBe(502);
  });
});
