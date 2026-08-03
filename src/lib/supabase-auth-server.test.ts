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
import { getDiscordAvatarUrl, getDiscordDisplayName, getDiscordId, getDiscordUsername } from "./supabase-auth-server";

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

describe("getDiscordAvatarUrl", () => {
  it("prefers the Discord identity's identity_data.avatar_url — it isn't user-editable, unlike user_metadata", () => {
    const user = makeUser({
      user_metadata: { avatar_url: "https://cdn.discordapp.com/avatars/1/metadata.png" },
      identities: [{ provider: "discord", identity_data: { avatar_url: "https://cdn.discordapp.com/avatars/1/identity.png" } }],
    });
    expect(getDiscordAvatarUrl(user)).toBe("https://cdn.discordapp.com/avatars/1/identity.png");
  });

  it("falls back to user_metadata.avatar_url when identity_data has none", () => {
    const user = makeUser({ user_metadata: { avatar_url: "https://cdn.discordapp.com/avatars/1/abc.png" } });
    expect(getDiscordAvatarUrl(user)).toBe("https://cdn.discordapp.com/avatars/1/abc.png");
  });

  it("also accepts the media.discordapp.net CDN host", () => {
    const user = makeUser({ user_metadata: { avatar_url: "https://media.discordapp.net/avatars/1/abc.png" } });
    expect(getDiscordAvatarUrl(user)).toBe("https://media.discordapp.net/avatars/1/abc.png");
  });

  it("returns undefined when no avatar is available anywhere", () => {
    const user = makeUser({});
    expect(getDiscordAvatarUrl(user)).toBeUndefined();
  });

  // Codex review (#236): user_metadata is directly writable by the signed-in
  // user via supabase.auth.updateUser({ data }) — an unvalidated value here
  // would let any player point every visitor's browser (this renders as a
  // public, unoptimized <Image>) at an arbitrary attacker-controlled URL.
  it("rejects a non-Discord-CDN host even when it's the only avatar_url present", () => {
    const user = makeUser({ user_metadata: { avatar_url: "https://evil.example/tracker.png" } });
    expect(getDiscordAvatarUrl(user)).toBeUndefined();
  });

  it("rejects a non-Discord-CDN identity_data.avatar_url too", () => {
    const user = makeUser({
      identities: [{ provider: "discord", identity_data: { avatar_url: "https://evil.example/tracker.png" } }],
    });
    expect(getDiscordAvatarUrl(user)).toBeUndefined();
  });

  it("rejects a non-https scheme", () => {
    const user = makeUser({ user_metadata: { avatar_url: "javascript:alert(1)" } });
    expect(getDiscordAvatarUrl(user)).toBeUndefined();
  });

  it("rejects a malformed URL instead of throwing", () => {
    const user = makeUser({ user_metadata: { avatar_url: "not a url" } });
    expect(getDiscordAvatarUrl(user)).toBeUndefined();
  });
});
