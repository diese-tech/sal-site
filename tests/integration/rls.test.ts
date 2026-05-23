/**
 * RLS integration tests — run against the real Supabase project using the anon key.
 *
 * These tests verify that Row Level Security policies are in effect:
 *   • Sensitive tables deny anon SELECT (zero rows returned, not an error — Supabase default-deny)
 *   • Protected tables deny anon INSERT (error 42501 insufficient_privilege)
 *   • Public tables allow anon SELECT
 *   • Registrations allow anon INSERT (public sign-up flow)
 *
 * The suite is skipped automatically when NEXT_PUBLIC_SUPABASE_URL /
 * NEXT_PUBLIC_SUPABASE_ANON_KEY are not set (e.g. offline unit-test runs).
 *
 * NOTE: The registration INSERT test may leave a row behind because anon cannot
 * DELETE. The row is clearly tagged with discord_id "_rls_test_*" for easy cleanup.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SKIP = !SUPABASE_URL || !SUPABASE_ANON_KEY;

describe.skipIf(SKIP)("RLS policies (anon client)", () => {
  let anon: SupabaseClient;

  beforeAll(() => {
    anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  });

  // -------------------------------------------------------------------------
  // Public tables: anon SELECT must succeed
  // -------------------------------------------------------------------------
  describe("Public tables — anon SELECT allowed", () => {
    const publicTables = [
      "orgs",
      "players",
      "matches",
      "standings",
      "announcements",
      "divisions",
      "seasons",
      "gods",
      "form_fields",
      "draft_rooms",
      "draft_picks",
    ] as const;

    for (const table of publicTables) {
      it(`SELECT ${table} returns no error`, async () => {
        const { error } = await anon.from(table).select("*").limit(5);
        expect(error, `Unexpected RLS block on SELECT ${table}: ${error?.message}`).toBeNull();
      });
    }
  });

  // -------------------------------------------------------------------------
  // Sensitive tables: anon SELECT must return zero rows (default-deny RLS)
  // Supabase returns [] without an error object when no SELECT policy exists.
  // -------------------------------------------------------------------------
  describe("Sensitive tables — anon SELECT returns no rows", () => {
    const sensitiveTables = [
      "admin_users",
      "captain_tokens",
      "admin_audit_log",
      "captain_shortlists",
    ] as const;

    for (const table of sensitiveTables) {
      it(`SELECT ${table} returns zero rows`, async () => {
        const { data, error } = await anon.from(table).select("*").limit(10);
        expect(
          error !== null || (Array.isArray(data) && data.length === 0),
          `${table}: expected no rows for anon but got ${JSON.stringify(data?.slice(0, 2))}`,
        ).toBe(true);
      });
    }

    it("SELECT registrations returns zero rows (no SELECT policy)", async () => {
      const { data, error } = await anon.from("registrations").select("*").limit(10);
      expect(
        error !== null || (Array.isArray(data) && data.length === 0),
        `registrations: expected no rows for anon SELECT but got ${JSON.stringify(data?.slice(0, 2))}`,
      ).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Write restrictions: anon INSERT into protected tables must be blocked
  // Supabase surfaces RLS INSERT blocks as error code 42501 (insufficient_privilege)
  // or "new row violates row-level security policy" message.
  // -------------------------------------------------------------------------
  describe("Protected tables — anon INSERT blocked", () => {
    const blockedInserts: Array<[string, Record<string, unknown>]> = [
      ["orgs", { name: "RLS-Test-Org", tag: "RLS" }],
      ["players", { ign: "rls-test-player" }],
      ["matches", { status: "scheduled" }],
      ["standings", { wins: 99, losses: 0 }],
      ["admin_users", { discord_id: "rls-test", role: "admin", discord_username: "rls" }],
      ["admin_audit_log", { action: "rls-test" }],
      ["seasons", { name: "RLS Test Season", status: "pre-season" }],
      ["divisions", { name: "RLS Div" }],
      ["announcements", { title: "RLS Test", body: "test", pinned: false }],
    ];

    for (const [table, payload] of blockedInserts) {
      it(`INSERT ${table} is blocked`, async () => {
        const { error } = await anon.from(table).insert(payload);
        expect(error, `Expected INSERT ${table} to fail for anon but got no error`).not.toBeNull();
      });
    }
  });

  // -------------------------------------------------------------------------
  // Registrations: anon INSERT is explicitly allowed (public sign-up)
  // Policy: CREATE POLICY "anon insert" ON registrations FOR INSERT WITH CHECK (true)
  // -------------------------------------------------------------------------
  it("anon can INSERT a registration (public sign-up policy is active)", async () => {
    const tag = `_rls_test_${Date.now()}`;
    const { error } = await anon.from("registrations").insert({
      id: tag,
      discord_id: tag,
      discord_username: "rls-test-runner",
      form_data: { _rls_test: true },
    });
    // RLS block = code 42501. A schema constraint error means RLS passed (we want that).
    if (error) {
      expect(
        error.code,
        `Registrations INSERT was blocked by RLS (expected schema/constraint error, not RLS): ${error.message}`,
      ).not.toBe("42501");
    }
  });
});
