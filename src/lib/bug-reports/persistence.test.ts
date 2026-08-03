import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  createDatabaseBugReportPersistence,
  createDatabaseBugReportStatusReader,
} from "./persistence";

const payload = {
  category: "website" as const,
  severity: "normal" as const,
  subject: "Standings do not load",
  description: "The current standings remain blank after the page finishes loading.",
  reproductionSteps: "Open standings, choose the active season, and wait.",
  expectedBehavior: "The standings table should display the active season.",
  environment: "Chrome on Windows 11",
  replyRelayConsent: false,
};

describe("database bug report persistence", () => {
  it("stores only hashes and returns the one-time anonymous access secret", async () => {
    const rpc = vi.fn().mockImplementation(async (name: string, args: Record<string, unknown>) => ({
      data: name === "create_bug_report"
        ? {
            ticketId: args.p_ticket_id,
            publicTicketId: args.p_public_ticket_id,
            status: "open",
          }
        : null,
      error: null,
    }));
    const persistence = createDatabaseBugReportPersistence({ rpc } as unknown as SupabaseClient<Database>);

    const result = await persistence.persist({
      payload,
      attachments: [],
      reporter: { kind: "anonymous" },
      abuseDecisionId: "11111111-1111-4111-8111-111111111111",
    });

    expect(result.reporterAccess.kind).toBe("anonymous");
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_anonymous_access_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(args.p_recovery_code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(args)).not.toContain(
      result.reporterAccess.kind === "anonymous" ? result.reporterAccess.oneTimeAccessToken : "",
    );
    expect(result.ticketId).toMatch(/^BUG-[A-F0-9]{12}$/);
    expect(result.publicTicketId).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("keeps unfinished attachment and relay paths fail-closed", async () => {
    const rpc = vi.fn();
    const persistence = createDatabaseBugReportPersistence({ rpc } as unknown as SupabaseClient<Database>);

    await expect(persistence.persist({
      payload,
      attachments: [{ opaqueRef: `brup_${"a".repeat(48)}` }],
      reporter: { kind: "anonymous" },
      abuseDecisionId: "11111111-1111-4111-8111-111111111111",
    })).rejects.toThrow("Screenshot intake");

    await expect(persistence.persist({
      payload: { ...payload, replyRelayConsent: true },
      attachments: [],
      reporter: { kind: "signed_in", authUserId: "user-1", discordId: "discord-1" },
      abuseDecisionId: "11111111-1111-4111-8111-111111111111",
    })).rejects.toThrow("Private reply relay");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("hashes private status tokens before the database lookup", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ticketId: "BUG-ABCDEF012345",
        status: "open",
        updatedAt: "2026-08-02T22:00:00.000Z",
        messages: [],
      },
      error: null,
    });
    const reader = createDatabaseBugReportStatusReader({ rpc } as unknown as SupabaseClient<Database>);

    await reader.read({
      publicTicketId: "public_ticket_000000000000000000000001",
      access: { kind: "anonymous", accessToken: `token_${"a".repeat(43)}` },
    });

    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_access_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(args)).not.toContain(`token_${"a".repeat(43)}`);
  });
});
