import { describe, expect, it } from "vitest";
import { normalizeBugReport } from "@/lib/admin-ticket-model";

describe("normalizeBugReport", () => {
  it("surfaces complete anonymous report details without reporter identity", () => {
    const ticket = normalizeBugReport({
      id: "11111111-1111-4111-8111-111111111111",
      ticket_id: "BUG-ABCDEF012345",
      status: "open",
      category: "website",
      severity: "critical",
      subject: "Public standings are unavailable",
      description: "The public standings page returns an empty table for the current season.",
      reproduction_steps: "Open standings and select the current season.",
      expected_behavior: "The current standings should appear.",
      environment: "Chrome on Windows 11",
      created_at: "2026-08-02T20:00:00.000Z",
      updated_at: "2026-08-02T20:00:00.000Z",
    });

    expect(ticket).toMatchObject({
      category: "bug_report",
      displayId: "BUG-ABCDEF012345",
      status: "open",
      priority: "urgent",
      privacy: "anonymous",
      title: "Public standings are unavailable",
    });
    expect(ticket.details).toEqual(expect.arrayContaining([
      { label: "What happened", value: expect.stringContaining("empty table") },
      { label: "Environment", value: "Chrome on Windows 11" },
    ]));
    expect(JSON.stringify(ticket)).not.toMatch(/discord|auth_user|access_token/i);
  });

  it("maps investigation and terminal states into the shared queue model", () => {
    const base = {
      id: "11111111-1111-4111-8111-111111111111",
      ticket_id: "BUG-ABCDEF012345",
      category: "website",
      severity: "normal",
      subject: "Schedule filter is confusing",
      description: "The schedule filter keeps an older division selected after navigation.",
      reproduction_steps: "Choose Lunar, leave the page, then return to schedule.",
      expected_behavior: "The schedule should return to the default division.",
      environment: null,
      created_at: "2026-08-02T20:00:00.000Z",
      updated_at: "2026-08-02T21:00:00.000Z",
    };

    expect(normalizeBugReport({ ...base, status: "investigating" }).status).toBe("claimed");
    expect(normalizeBugReport({ ...base, status: "resolved" }).status).toBe("resolved");
    expect(normalizeBugReport({ ...base, status: "no_response" }).status).toBe("cancelled");
  });
});
