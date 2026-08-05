import { describe, expect, it, vi } from "vitest";
import type { AdminTicket } from "@/types/admin-ticket";
import { getTicketActionMode, runTicketAction } from "@/lib/admin-ticket-actions";

function registrationTicket(): AdminTicket {
  return {
    id: "registration:registration-1",
    displayId: "RG-REGISTRA",
    sourceId: "registration-1",
    category: "registration",
    status: "open",
    sourceStatus: "pending",
    priority: "normal",
    createdAt: "2026-07-19T12:00:00.000Z",
    updatedAt: "2026-07-19T12:00:00.000Z",
    title: "Registration: New Player",
    summary: "Player registration from @newplayer.",
    privacy: "public",
    links: [],
    timeline: [{ at: "2026-07-19T12:00:00.000Z", label: "Submitted" }],
    workflow: { kind: "site", href: "/admin/registrations", label: "Handle in Registrations" },
  };
}

describe("runTicketAction", () => {
  it("sends an operation Needs Info decision through the queue endpoint", async () => {
    const ticket: AdminTicket = {
      ...registrationTicket(),
      id: "operation:action-1",
      sourceId: "action-1",
      category: "operation",
    };
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, status: "pending_info" }), {
        status: 200,
      }),
    );
    const onOptimistic = vi.fn();

    const result = await runTicketAction({
      ticket,
      action: {
        kind: "resolve_operation",
        decision: "needs_info",
        note: "Upload the missing detail screen.",
      },
      fetcher,
      now: () => "2026-08-05T04:00:00.000Z",
      onOptimistic,
      onRollback: vi.fn(),
      onSuccess: vi.fn(),
    });

    expect(fetcher).toHaveBeenCalledWith("/api/admin/tickets/operations/action-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: "needs_info",
        note: "Upload the missing detail screen.",
      }),
    });
    expect(onOptimistic).toHaveBeenCalledWith(
      expect.objectContaining({ status: "needs_info", sourceStatus: "pending_info" }),
    );
    expect(result).toEqual({ ok: true });
  });

  it("restores a stat-review ticket when its denial fails", async () => {
    const ticket: AdminTicket = {
      ...registrationTicket(),
      id: "stat_review:record-1",
      sourceId: "record-1",
      category: "stat_review",
    };
    const onRollback = vi.fn();
    const onOptimistic = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 409 }));

    const result = await runTicketAction({
      ticket,
      action: {
        kind: "resolve_stat_review",
        decision: "deny",
        note: "The screenshot does not support this line.",
      },
      fetcher,
      onOptimistic,
      onRollback,
      onSuccess: vi.fn(),
    });

    expect(fetcher).toHaveBeenCalledWith("/api/admin/tickets/stat-reviews/record-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: "deny",
        note: "The screenshot does not support this line.",
      }),
    });
    expect(onOptimistic).toHaveBeenCalledWith(
      expect.objectContaining({ status: "denied", sourceStatus: "rejected" }),
    );
    expect(onRollback).toHaveBeenCalledWith(ticket);
    expect(result).toEqual({
      ok: false,
      error: "The action failed. The ticket was restored.",
    });
  });

  it("optimistically approves a registration, then confirms it through the existing endpoint", async () => {
    const original = registrationTicket();
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, playerId: "player-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const onOptimistic = vi.fn();
    const onRollback = vi.fn();
    const onSuccess = vi.fn();

    const result = await runTicketAction({
      ticket: original,
      action: { kind: "approve_registration", reviewerNote: "Eligibility checked" },
      fetcher,
      now: () => "2026-07-19T13:00:00.000Z",
      onOptimistic,
      onRollback,
      onSuccess,
    });

    expect(onOptimistic).toHaveBeenCalledWith(
      expect.objectContaining({ status: "resolved", sourceStatus: "approved" }),
    );
    expect(fetcher).toHaveBeenCalledWith("/api/admin/registrations/registration-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved", reviewerNote: "Eligibility checked" }),
    });
    expect(onRollback).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ status: "resolved", sourceStatus: "approved" }),
    );
    expect(result).toEqual({ ok: true });
  });

  it("restores the exact ticket when a registration rejection fails", async () => {
    const original = registrationTicket();
    const onOptimistic = vi.fn();
    const onRollback = vi.fn();

    const result = await runTicketAction({
      ticket: original,
      action: { kind: "reject_registration", reviewerNote: "Duplicate signup" },
      fetcher: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "database unavailable" }), { status: 503 }),
      ),
      onOptimistic,
      onRollback,
      onSuccess: vi.fn(),
    });

    expect(onOptimistic).toHaveBeenCalledWith(
      expect.objectContaining({ status: "denied", sourceStatus: "rejected" }),
    );
    expect(onRollback).toHaveBeenCalledWith(original);
    expect(result).toEqual({
      ok: false,
      error: "The action failed. The ticket was restored.",
    });
  });

  it("submits only confirmed validated games to the existing match-report endpoint", async () => {
    const report = { ...registrationTicket(), category: "match_report" as const, sourceId: "report-1" };
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, homeScore: 1, awayScore: 0 }), { status: 200 }),
    );
    const games = [
      {
        gameNumber: 1,
        winningSide: "home" as const,
        players: [
          { playerIgn: "Home", side: "home" as const, won: true, kills: 5, deaths: 1, assists: 4 },
          { playerIgn: "Away", side: "away" as const, won: false, kills: 1, deaths: 5, assists: 2 },
        ],
      },
    ];

    await runTicketAction({
      ticket: report,
      action: { kind: "resolve_match_report", games },
      fetcher,
      onOptimistic: vi.fn(),
      onRollback: vi.fn(),
      onSuccess: vi.fn(),
    });

    expect(fetcher).toHaveBeenCalledWith("/api/admin/match-reports/report-1/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ games }),
    });
  });

  it("updates a bug report through its dedicated admin endpoint", async () => {
    const ticket: AdminTicket = {
      ...registrationTicket(),
      id: "bug_report:11111111-1111-4111-8111-111111111111",
      sourceId: "11111111-1111-4111-8111-111111111111",
      category: "bug_report",
      displayId: "BUG-ABCDEF012345",
      privacy: "anonymous",
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const onOptimistic = vi.fn();

    await runTicketAction({
      ticket,
      action: { kind: "update_bug_report_status", status: "investigating" },
      fetcher,
      now: () => "2026-08-02T22:00:00.000Z",
      onOptimistic,
      onRollback: vi.fn(),
      onSuccess: vi.fn(),
    });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/admin/bug-reports/11111111-1111-4111-8111-111111111111",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "investigating" }),
      },
    );
    expect(onOptimistic).toHaveBeenCalledWith(
      expect.objectContaining({ status: "claimed", sourceStatus: "investigating" }),
    );
  });
});

describe("getTicketActionMode", () => {
  it("gates each queue category by capability and source state", () => {
    const registration = registrationTicket();
    const canAct = {
      canViewQueue: true,
      canActOnTickets: true,
      canViewRestrictedIdentities: false,
    };

    expect(
      getTicketActionMode(registration, { ...canAct, canActOnTickets: false }),
    ).toBe("read_only");
    expect(getTicketActionMode({ ...registration, category: "operation" }, canAct)).toBe("operation");
    expect(
      getTicketActionMode(
        { ...registration, category: "operation", status: "needs_info" },
        canAct,
      ),
    ).toBe("operation");
    expect(getTicketActionMode({ ...registration, category: "stat_review" }, canAct)).toBe("stat_review");
    expect(
      getTicketActionMode(
        { ...registration, category: "stat_review", status: "needs_info" },
        canAct,
      ),
    ).toBe("read_only");
    expect(getTicketActionMode(registration, canAct)).toBe("registration");
    expect(getTicketActionMode({ ...registration, category: "match_report" }, canAct)).toBe("match_report");
    expect(getTicketActionMode({ ...registration, category: "bug_report" }, canAct)).toBe("bug_report");
    expect(getTicketActionMode({ ...registration, category: "bug_report", status: "claimed" }, canAct)).toBe("bug_report");
    expect(getTicketActionMode({ ...registration, status: "resolved" }, canAct)).toBe("read_only");
  });
});
