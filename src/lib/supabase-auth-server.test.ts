/**
 * getDiscordUsername/getDiscordDisplayName PII regression test.
 *
 * getDiscordUsername's return value is persisted on registrations/players and
 * rendered publicly (player directory, team rosters). It previously fell back
 * to the account's real email address whenever Supabase's Discord OAuth
 * session didn't populate user_metadata.user_name, which leaked real users'
 * emails to every site visitor. It must never fall back to email (or any
 * other PII) — an empty string is the only acceptable fallback.
 */

import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { getDiscordDisplayName, getDiscordId, getDiscordUsername } from "./supabase-auth-server";

function makeUser(overrides: { user_metadata?: Record<string, unknown>; email?: string; identities?: unknown[] } = {}): User {
  return {
    id: "user-1",
    app_metadata: {},
    user_metadata: overrides.user_metadata ?? {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
    email: overrides.email,
    identities: overrides.identities as User["identities"],
  } as User;
}

describe("getDiscordUsername", () => {
  it("returns user_metadata.user_name when present", () => {
    const user = makeUser({ user_metadata: { user_name: "brawler99" } });
    expect(getDiscordUsername(user)).toBe("brawler99");
  });

  it("returns an empty string — NEVER the account email — when user_name is missing", () => {
    const user = makeUser({ email: "realperson@example.com" });
    expect(getDiscordUsername(user)).toBe("");
    expect(getDiscordUsername(user)).not.toContain("@");
  });

  it("returns an empty string when user_metadata itself is absent", () => {
    const user = { id: "u2", app_metadata: {}, aud: "authenticated", created_at: "2026-01-01T00:00:00Z", email: "another@example.com" } as User;
    expect(getDiscordUsername(user)).toBe("");
  });
});

describe("getDiscordDisplayName", () => {
  it("prefers full_name but falls back to the (email-safe) username, never email", () => {
    const withFullName = makeUser({ user_metadata: { full_name: "Brawler" }, email: "leak@example.com" });
    expect(getDiscordDisplayName(withFullName)).toBe("Brawler");

    const withoutFullName = makeUser({ email: "leak@example.com" });
    expect(getDiscordDisplayName(withoutFullName)).toBe("");
  });
});

describe("getDiscordId", () => {
  it("still resolves normally (unaffected by the username fix)", () => {
    const user = makeUser({ user_metadata: { provider_id: "123456789" } });
    expect(getDiscordId(user)).toBe("123456789");
  });
});
