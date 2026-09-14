import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/league-data", () => ({ writeAuditLog: vi.fn() }));

import { getSupabaseServerClient } from "@/lib/supabase-server";
import { writeAuditLog } from "@/lib/league-data";
import { AdminUsersError, getAdminUser, removeAdminUser, upsertAdminUser } from "./admin-users";

// Each `.from("admin_users")` call in the code under test gets its own chain
// object with its own canned result, queued in call order via
// mockReturnValueOnce — select/eq/upsert/delete all return the same builder,
// which is both further chainable (.maybeSingle/.single) and directly
// awaitable (.then), matching how the real Supabase query builder behaves.
function chain(result: { data?: unknown; error?: unknown; count?: number }) {
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
    then: (resolve: (value: typeof result) => unknown) => unknown;
  } = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve(result)),
    upsert: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

function mockClient(...chains: ReturnType<typeof chain>[]) {
  const from = vi.fn();
  for (const c of chains) from.mockReturnValueOnce(c);
  vi.mocked(getSupabaseServerClient).mockReturnValue({ from } as never);
  return from;
}

const newRow = {
  discord_id: "11111111111111111",
  role: "admin",
  discord_username: "newmod",
  display_name: "New Mod",
  created_at: "2026-09-13T00:00:00Z",
};

describe("upsertAdminUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a Discord username or malformed ID before touching the database", async () => {
    const from = mockClient();
    await expect(
      upsertAdminUser({ discordId: "deadman5460", role: "admin" }, "99999999999999999"),
    ).rejects.toThrow(AdminUsersError);
    expect(from).not.toHaveBeenCalled();
  });

  it("adds a new admin and audits it with no previous role", async () => {
    mockClient(
      chain({ data: null, error: null }), // existing lookup: none
      chain({ data: newRow, error: null }), // upsert
    );

    const result = await upsertAdminUser(
      { discordId: newRow.discord_id, role: "admin", discordUsername: "newmod", displayName: "New Mod" },
      "99999999999999999",
    );

    expect(result).toEqual({
      discordId: newRow.discord_id,
      role: "admin",
      discordUsername: "newmod",
      displayName: "New Mod",
      createdAt: newRow.created_at,
    });
    expect(writeAuditLog).toHaveBeenCalledWith("add_admin_user", "admin_user", newRow.discord_id, {
      role: "admin",
      previousRole: null,
      actorDiscordId: "99999999999999999",
    });
  });

  it("refuses to let a super admin demote themselves, without writing anything", async () => {
    mockClient(chain({ data: { role: "super_admin" }, error: null })); // existing lookup: self, super_admin

    await expect(
      upsertAdminUser({ discordId: "99999999999999999", role: "admin" }, "99999999999999999"),
    ).rejects.toThrow(/cannot remove your own super admin role/i);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("allows a super admin to edit their own display name without changing role", async () => {
    mockClient(
      chain({ data: { role: "super_admin" }, error: null }), // existing lookup: self
      chain({ data: { ...newRow, discord_id: "99999999999999999", role: "super_admin" }, error: null }), // upsert
    );

    await expect(
      upsertAdminUser({ discordId: "99999999999999999", role: "super_admin", displayName: "Renamed" }, "99999999999999999"),
    ).resolves.toMatchObject({ role: "super_admin" });
  });

  it("promotes an existing admin and audits the previous role", async () => {
    mockClient(
      chain({ data: { role: "admin" }, error: null }), // existing lookup: admin
      chain({ data: { ...newRow, role: "super_admin" }, error: null }), // upsert
    );

    const result = await upsertAdminUser(
      { discordId: newRow.discord_id, role: "super_admin" },
      "99999999999999999",
    );

    expect(result.role).toBe("super_admin");
    expect(writeAuditLog).toHaveBeenCalledWith("update_admin_user_role", "admin_user", newRow.discord_id, {
      role: "super_admin",
      previousRole: "admin",
      actorDiscordId: "99999999999999999",
    });
  });
});

describe("removeAdminUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses to remove yourself without querying the database", async () => {
    const from = mockClient();
    await expect(removeAdminUser("99999999999999999", "99999999999999999")).rejects.toThrow(AdminUsersError);
    expect(from).not.toHaveBeenCalled();
  });

  it("refuses to remove a Discord ID that isn't an admin", async () => {
    mockClient(chain({ data: null, error: null })); // target lookup: none

    await expect(removeAdminUser("not-an-admin", "99999999999999999")).rejects.toThrow(AdminUsersError);
  });

  it("refuses to remove the last super admin", async () => {
    mockClient(
      chain({ data: { role: "super_admin" }, error: null }), // target lookup
      chain({ count: 1, error: null }), // super_admin count
    );

    await expect(removeAdminUser("target-1", "99999999999999999")).rejects.toThrow(/last super admin/);
  });

  it("removes a super admin when another one still exists, and audits it", async () => {
    const deleteChain = chain({ error: null });
    mockClient(
      chain({ data: { role: "super_admin" }, error: null }), // target lookup
      chain({ count: 2, error: null }), // super_admin count
      deleteChain, // delete
    );

    await removeAdminUser("target-1", "99999999999999999");

    expect(deleteChain.delete).toHaveBeenCalled();
    expect(deleteChain.eq).toHaveBeenCalledWith("discord_id", "target-1");
    expect(writeAuditLog).toHaveBeenCalledWith("remove_admin_user", "admin_user", "target-1", {
      role: "super_admin",
      actorDiscordId: "99999999999999999",
    });
  });

  it("removes a plain admin without checking the super-admin count", async () => {
    const deleteChain = chain({ error: null });
    mockClient(
      chain({ data: { role: "admin" }, error: null }), // target lookup
      deleteChain, // delete — no count query for a non-super_admin target
    );

    await removeAdminUser("target-1", "99999999999999999");

    expect(deleteChain.delete).toHaveBeenCalled();
  });
});

describe("getAdminUser", () => {
  beforeEach(() => vi.clearAllMocks());

  // This is what route.ts's requireSuperAdmin calls on every request instead
  // of trusting session.role — it must reflect the row as it is right now,
  // demotions and removals included.
  it("returns the current row for an existing admin", async () => {
    mockClient(chain({ data: { ...newRow, role: "super_admin" }, error: null }));

    const result = await getAdminUser(newRow.discord_id);

    expect(result).toMatchObject({ discordId: newRow.discord_id, role: "super_admin" });
  });

  it("returns null once the admin has been removed", async () => {
    mockClient(chain({ data: null, error: null }));

    const result = await getAdminUser("99999999999999999");

    expect(result).toBeNull();
  });
});
