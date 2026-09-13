import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({ getAdminRequestSession: vi.fn() }));
vi.mock("@/lib/admin-users", () => ({
  AdminUsersError: class AdminUsersError extends Error {},
  getAdminUsers: vi.fn(),
  upsertAdminUser: vi.fn(),
  removeAdminUser: vi.fn(),
}));

import { getAdminRequestSession } from "@/lib/admin-auth";
import { AdminUsersError, getAdminUsers, removeAdminUser, upsertAdminUser } from "@/lib/admin-users";
import { DELETE, GET, POST } from "./route";

const admin = { discordId: "222", role: "admin" as const, exp: Date.now() + 60_000 };
const superAdmin = { discordId: "111", role: "super_admin" as const, exp: Date.now() + 60_000 };

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

describe("GET /api/admin/admins", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a plain admin", async () => {
    vi.mocked(getAdminRequestSession).mockReturnValue(admin);
    const response = await GET(postRequest(undefined));
    expect(response.status).toBe(403);
    expect(getAdminUsers).not.toHaveBeenCalled();
  });

  it("lists admins for a super admin", async () => {
    vi.mocked(getAdminRequestSession).mockReturnValue(superAdmin);
    vi.mocked(getAdminUsers).mockResolvedValue([]);
    const response = await GET(postRequest(undefined));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ admins: [] });
  });
});

describe("POST /api/admin/admins", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a plain admin before touching the database", async () => {
    vi.mocked(getAdminRequestSession).mockReturnValue(admin);
    const response = await POST(postRequest({ discordId: "12345678901234567", role: "admin" }));
    expect(response.status).toBe(403);
    expect(upsertAdminUser).not.toHaveBeenCalled();
  });

  it("rejects a malformed body without calling the database", async () => {
    vi.mocked(getAdminRequestSession).mockReturnValue(superAdmin);
    const response = await POST(postRequest({ discordId: "", role: "owner" }));
    expect(response.status).toBe(400);
    expect(upsertAdminUser).not.toHaveBeenCalled();
  });

  it("saves a valid admin for a super admin and passes the actor through", async () => {
    vi.mocked(getAdminRequestSession).mockReturnValue(superAdmin);
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
    vi.mocked(getAdminRequestSession).mockReturnValue(superAdmin);
    vi.mocked(upsertAdminUser).mockRejectedValue(new AdminUsersError("Cannot remove the last super admin."));

    const response = await POST(postRequest({ discordId: "12345678901234567", role: "admin" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Cannot remove the last super admin." });
  });

  it("maps an unexpected error to 500", async () => {
    vi.mocked(getAdminRequestSession).mockReturnValue(superAdmin);
    vi.mocked(upsertAdminUser).mockRejectedValue(new Error("connection reset"));

    const response = await POST(postRequest({ discordId: "12345678901234567", role: "admin" }));

    expect(response.status).toBe(500);
  });
});

describe("DELETE /api/admin/admins", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a plain admin before touching the database", async () => {
    vi.mocked(getAdminRequestSession).mockReturnValue(admin);
    const response = await DELETE(deleteRequest("333"));
    expect(response.status).toBe(403);
    expect(removeAdminUser).not.toHaveBeenCalled();
  });

  it("requires a discordId query param", async () => {
    vi.mocked(getAdminRequestSession).mockReturnValue(superAdmin);
    const response = await DELETE(deleteRequest());
    expect(response.status).toBe(400);
    expect(removeAdminUser).not.toHaveBeenCalled();
  });

  it("removes the admin and passes the actor through", async () => {
    vi.mocked(getAdminRequestSession).mockReturnValue(superAdmin);
    vi.mocked(removeAdminUser).mockResolvedValue(undefined);

    const response = await DELETE(deleteRequest("333"));

    expect(response.status).toBe(200);
    expect(removeAdminUser).toHaveBeenCalledWith("333", "111");
  });

  it("maps a validation error (e.g. self-removal) from the data layer to 400", async () => {
    vi.mocked(getAdminRequestSession).mockReturnValue(superAdmin);
    vi.mocked(removeAdminUser).mockRejectedValue(new AdminUsersError("You cannot remove your own admin access."));

    const response = await DELETE(deleteRequest("111"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "You cannot remove your own admin access." });
  });
});
