import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({ getAdminRequestSession: vi.fn() }));
vi.mock("@/lib/admin-users", () => ({
  AdminUsersError: class AdminUsersError extends Error {},
  getAdminUser: vi.fn(),
  getAdminUsers: vi.fn(),
  upsertAdminUser: vi.fn(),
  removeAdminUser: vi.fn(),
}));

import { getAdminRequestSession } from "@/lib/admin-auth";
import {
  AdminUsersError,
  getAdminUser,
  getAdminUsers,
  removeAdminUser,
  upsertAdminUser,
} from "@/lib/admin-users";
import { DELETE, GET, POST } from "./route";

// The cookie only ever supplies discordId + exp; every test sets the DB row
// via getAdminUser separately, since that — not session.role — is what the
// route now authorizes against (see route.ts for why: a stale cookie must
// not outlive a revocation).
const adminCookie = { discordId: "222", role: "admin" as const, exp: Date.now() + 60_000 };
const superAdminCookie = { discordId: "111", role: "super_admin" as const, exp: Date.now() + 60_000 };
const superAdminRow = { discordId: "111", role: "super_admin" as const, discordUsername: null, displayName: null, createdAt: "now" };
const adminRow = { discordId: "222", role: "admin" as const, discordUsername: null, displayName: null, createdAt: "now" };

function asSuperAdmin() {
  vi.mocked(getAdminRequestSession).mockReturnValue(superAdminCookie);
  vi.mocked(getAdminUser).mockResolvedValue(superAdminRow);
}

function postRequest(body: unknown) {
  return new NextRequest("https://sal.example/api/admin/admins", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest(discordId?: string) {
  const url = discordId
    ? `https://sal.example/api/admin/admins?discordId=${discordId}`
    : "https://sal.example/api/admin/admins";
  return new NextRequest(url, { method: "DELETE" });
}

describe("requireSuperAdmin re-checks admin_users, not the cookie", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a plain admin's cookie and DB row alike", async () => {
    vi.mocked(getAdminRequestSession).mockReturnValue(adminCookie);
    vi.mocked(getAdminUser).mockResolvedValue(adminRow);

    const response = await GET(postRequest(undefined));

    expect(response.status).toBe(403);
    expect(getAdminUsers).not.toHaveBeenCalled();
  });

  it("rejects a super_admin cookie once the DB row has been demoted", async () => {
    // This is the exploit Codex flagged: without the live check, a demoted
    // super admin's still-valid cookie would pass this gate and could call
    // POST below to grant the role back to themselves.
    vi.mocked(getAdminRequestSession).mockReturnValue(superAdminCookie);
    vi.mocked(getAdminUser).mockResolvedValue(adminRow);

    const getResponse = await GET(postRequest(undefined));
    expect(getResponse.status).toBe(403);

    const postResponse = await POST(postRequest({ discordId: "111", role: "super_admin" }));
    expect(postResponse.status).toBe(403);
    expect(upsertAdminUser).not.toHaveBeenCalled();
  });

  it("rejects a super_admin cookie once the row has been removed entirely", async () => {
    vi.mocked(getAdminRequestSession).mockReturnValue(superAdminCookie);
    vi.mocked(getAdminUser).mockResolvedValue(null);

    const response = await GET(postRequest(undefined));

    expect(response.status).toBe(403);
  });

  it("rejects when there is no session at all, without querying admin_users", async () => {
    vi.mocked(getAdminRequestSession).mockReturnValue(null);

    const response = await GET(postRequest(undefined));

    expect(response.status).toBe(403);
    expect(getAdminUser).not.toHaveBeenCalled();
  });

  it("passes a super_admin whose cookie and current row still agree", async () => {
    asSuperAdmin();
    vi.mocked(getAdminUsers).mockResolvedValue([]);

    const response = await GET(postRequest(undefined));

    expect(response.status).toBe(200);
  });
});

describe("POST /api/admin/admins", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a malformed body without calling the database", async () => {
    asSuperAdmin();
    const response = await POST(postRequest({ discordId: "", role: "owner" }));
    expect(response.status).toBe(400);
    expect(upsertAdminUser).not.toHaveBeenCalled();
  });

  it("saves a valid admin for a super admin and passes the actor through", async () => {
    asSuperAdmin();
    const saved = { discordId: "12345678901234567", role: "admin" as const, discordUsername: null, displayName: null, createdAt: "now" };
    vi.mocked(upsertAdminUser).mockResolvedValue(saved);

    const response = await POST(postRequest({ discordId: "12345678901234567", role: "admin" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, admin: saved });
    expect(upsertAdminUser).toHaveBeenCalledWith(
      { discordId: "12345678901234567", role: "admin" },
      "111",
    );
  });

  it("maps a validation error from the data layer to 400", async () => {
    asSuperAdmin();
    vi.mocked(upsertAdminUser).mockRejectedValue(new AdminUsersError("Cannot remove the last super admin."));

    const response = await POST(postRequest({ discordId: "12345678901234567", role: "admin" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Cannot remove the last super admin." });
  });

  it("maps an unexpected error to 500", async () => {
    asSuperAdmin();
    vi.mocked(upsertAdminUser).mockRejectedValue(new Error("connection reset"));

    const response = await POST(postRequest({ discordId: "12345678901234567", role: "admin" }));

    expect(response.status).toBe(500);
  });
});

describe("DELETE /api/admin/admins", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a discordId query param", async () => {
    asSuperAdmin();
    const response = await DELETE(deleteRequest());
    expect(response.status).toBe(400);
    expect(removeAdminUser).not.toHaveBeenCalled();
  });

  it("removes the admin and passes the actor through", async () => {
    asSuperAdmin();
    vi.mocked(removeAdminUser).mockResolvedValue(undefined);

    const response = await DELETE(deleteRequest("333"));

    expect(response.status).toBe(200);
    expect(removeAdminUser).toHaveBeenCalledWith("333", "111");
  });

  it("maps a validation error (e.g. self-removal) from the data layer to 400", async () => {
    asSuperAdmin();
    vi.mocked(removeAdminUser).mockRejectedValue(new AdminUsersError("You cannot remove your own admin access."));

    const response = await DELETE(deleteRequest("111"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "You cannot remove your own admin access." });
  });
});
