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

  // Codex review (#233): giving up as soon as user_metadata.user_name is
  // absent left real users permanently stuck with a blank registration —
  // some sessions only carry the username on the Discord identity itself.
  it("recovers the username from the Discord identity's identity_data when user_metadata.user_name is absent", () => {
    const user = makeUser({
      email: "realperson@example.com",
      identities: [{ provider: "discord", identity_data: { user_name: "recovered_handle" } }],
    });
    expect(getDiscordUsername(user)).toBe("recovered_handle");
  });

  it("still prefers user_metadata.user_name over the identity_data fallback", () => {
    const user = makeUser({
      user_metadata: { user_name: "top_level_handle" },
      identities: [{ provider: "discord", identity_data: { user_name: "identity_handle" } }],
    });
    expect(getDiscordUsername(user)).toBe("top_level_handle");
  });

  it("ignores identity_data from a non-Discord provider", () => {
    const user = makeUser({
      email: "realperson@example.com",
      identities: [{ provider: "email", identity_data: { user_name: "should-not-be-used" } }],
    });
    expect(getDiscordUsername(user)).toBe("");
  });

  // Confirmed against live incident data (#233 follow-up, auth.users.raw_user_meta_data):
  // every affected account had user_name AND identity_data.user_name empty,
  // but the raw OIDC `name` claim held "handle#0" (Discord's discriminator
  // placeholder for accounts on the newer global-handle system).
  it("recovers the username by stripping the discriminator off user_metadata.name", () => {
    const user = makeUser({ user_metadata: { name: "rteki#0" }, email: "totskablade8@gmail.com" });
    expect(getDiscordUsername(user)).toBe("rteki");
  });

  it("recovers the username from the Discord identity's identity_data.name as a last resort", () => {
    const user = makeUser({
      email: "realperson@example.com",
      identities: [{ provider: "discord", identity_data: { name: "identity_handle#1234" } }],
    });
    expect(getDiscordUsername(user)).toBe("identity_handle");
  });

  // Codex review (#235): full_name/global_name can be a distinct, non-unique
  // display name Discord users set separately from their real handle (e.g.
  // real handle "ne1217" shown on Discord as "XGN Ninjaa") — accepting it as
  // the username could match/claim the wrong player. name#discriminator
  // parsing must win over any display-name-shaped field.
  it("never returns full_name or global_name — even when name parsing is unavailable", () => {
    const user = makeUser({
      user_metadata: { full_name: "XGN Ninjaa" },
      email: "njengels@eagles.usi.edu",
      identities: [{ provider: "discord", identity_data: { global_name: "XGN Ninjaa" } }],
    });
    expect(getDiscordUsername(user)).toBe("");
  });

  it("prefers name#discriminator parsing over full_name/global_name when both are present", () => {
    const user = makeUser({
      user_metadata: { name: "ne1217#0", full_name: "XGN Ninjaa" },
    });
    expect(getDiscordUsername(user)).toBe("ne1217");
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
