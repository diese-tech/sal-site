import { describe, expect, it } from "vitest";
import type { AdminTicket } from "@/types/admin-ticket";
import { DEFAULT_TICKET_FILTERS } from "@/types/admin-ticket";
import {
  applyTicketFilters,
  getTicketCounts,
  normalizeMatchReport,
  normalizePendingAction,
  normalizePendingStatRecord,
  normalizeRegistration,
  normalizeTicketSources,
  searchMatches,
  sortTickets,
  type MatchReportSourceRow,
  type PendingActionSourceRow,
  type PendingStatRecordSourceRow,
  type RegistrationSourceRow,
} from "@/lib/admin-ticket-model";

function pendingActionRow(overrides: Partial<PendingActionSourceRow> = {}): PendingActionSourceRow {
  return {
    id: "aaaa1111-0000-0000-0000-000000000001",
    type: "match_result",
    status: "pending",
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-01T10:00:00Z",
    division_id: "solar",
    match_id: "mmmm2222-0000-0000-0000-000000000001",
    admin_note: null,
    source_discord_message_url: "https://discord.com/channels/1/2/3",
    approved_at: null,
    ...overrides,
  };
}

function statRecordRow(
  overrides: Partial<PendingStatRecordSourceRow> = {},
): PendingStatRecordSourceRow {
  return {
    id: "bbbb1111-0000-0000-0000-000000000001",
    status: "pending",
    created_at: "2026-07-02T10:00:00Z",
    updated_at: "2026-07-02T10:00:00Z",
    match_id: "mmmm2222-0000-0000-0000-000000000001",
    player_id: null,
    confidence: 0.9,
    source: "ocr",
    screenshot_url: "https://cdn.example.com/shot.png",
    correction_note: null,
    reviewed_at: null,
    ...overrides,
  };
}

function registrationRow(overrides: Partial<RegistrationSourceRow> = {}): RegistrationSourceRow {
  return {
    id: "cccc1111-0000-0000-0000-000000000001",
    status: "pending",
    created_at: "2026-07-03T10:00:00Z",
    reviewed_at: null,
    reviewer_note: null,
    season_id: "season-1",
    player_id: null,
    discord_username: "newplayer",
    discord_display_name: "New Player",
    form_data: {
      name: "Ada Vale",
      ign: "AdaSMITE",
      primary_role: "Mid",
      secondary_role: "Support",
      tracker_url: "https://tracker.gg/p/ada",
    },
    ...overrides,
  };
}

function matchReportRow(overrides: Partial<MatchReportSourceRow> = {}): MatchReportSourceRow {
  return {
    id: "dddd1111-0000-0000-0000-000000000001",
    status: "review",
    created_at: "2026-07-04T10:00:00Z",
    reviewed_at: null,
    match_id: "mmmm2222-0000-0000-0000-000000000002",
    season_id: "season-1",
    division_id: "lunar",
    home_score: 2,
    away_score: 1,
    total_games: 3,
    screenshot_urls: ["https://cdn.example.com/g1.png", "https://cdn.example.com/g2.png"],
    ...overrides,
  };
}

function ticket(overrides: Partial<AdminTicket>): AdminTicket {
  return {
    ...normalizeRegistration(registrationRow()),
    ...overrides,
  };
}

describe("normalizePendingAction", () => {
  it("normalizes an open match result request", () => {
    const t = normalizePendingAction(pendingActionRow());
    expect(t.category).toBe("operation");
    expect(t.status).toBe("open");
    expect(t.sourceStatus).toBe("pending");
    expect(t.priority).toBe("high");
    expect(t.id).toBe("operation:aaaa1111-0000-0000-0000-000000000001");
    expect(t.displayId).toBe("OP-AAAA1111");
    expect(t.title).toBe("Match Result request");
    expect(t.workflow).toEqual({
      kind: "discord",
      label: "Managed through the Discord review workflow",
    });
    expect(t.links).toEqual([
      { label: "Discord source message", href: "https://discord.com/channels/1/2/3", external: true },
    ]);
  });

  it("maps source statuses onto normalized statuses", () => {
    expect(normalizePendingAction(pendingActionRow({ status: "pending_info" })).status).toBe("needs_info");
    expect(normalizePendingAction(pendingActionRow({ status: "approved" })).status).toBe("resolved");
    expect(normalizePendingAction(pendingActionRow({ status: "denied" })).status).toBe("denied");
    expect(normalizePendingAction(pendingActionRow({ status: "cancelled" })).status).toBe("cancelled");
  });

  it("surfaces unknown source statuses as open instead of hiding them", () => {
    const t = normalizePendingAction(pendingActionRow({ status: "mystery_state" }));
    expect(t.status).toBe("open");
    expect(t.sourceStatus).toBe("mystery_state");
  });

  it("gives non match-result operations normal priority", () => {
    expect(normalizePendingAction(pendingActionRow({ type: "schedule_change" })).priority).toBe("normal");
  });

  it("drops non-http source links", () => {
    const t = normalizePendingAction(
      pendingActionRow({ source_discord_message_url: "javascript:alert(1)" }),
    );
    expect(t.links).toEqual([]);
  });

  it("includes admin notes in the timeline", () => {
    const t = normalizePendingAction(
      pendingActionRow({ admin_note: "Waiting on opponent confirmation", updated_at: "2026-07-02T09:00:00Z" }),
    );
    expect(t.timeline.some((e) => e.detail === "Waiting on opponent confirmation")).toBe(true);
  });

  it("never serializes requester identities even if extra columns leak into the row", () => {
    const leakyRow = {
      ...pendingActionRow(),
      requested_by_discord_id: "9876543210",
      approved_by_discord_id: "1234509876",
    };
    const serialized = JSON.stringify(normalizePendingAction(leakyRow));
    expect(serialized).not.toContain("9876543210");
    expect(serialized).not.toContain("1234509876");
  });
});

describe("normalizePendingStatRecord", () => {
  it("normalizes a pending stat extraction", () => {
    const t = normalizePendingStatRecord(statRecordRow());
    expect(t.category).toBe("stat_review");
    expect(t.status).toBe("open");
    expect(t.priority).toBe("normal");
    expect(t.displayId).toBe("SR-BBBB1111");
    expect(t.summary).toContain("90% confidence");
    expect(t.links).toEqual([
      { label: "Stat screenshot", href: "https://cdn.example.com/shot.png", external: true },
    ]);
  });

  it("raises priority for low-confidence extractions", () => {
    expect(normalizePendingStatRecord(statRecordRow({ confidence: 0.3 })).priority).toBe("high");
    expect(normalizePendingStatRecord(statRecordRow({ confidence: 0.5 })).priority).toBe("normal");
  });

  it("clamps out-of-range confidence values in the summary", () => {
    expect(normalizePendingStatRecord(statRecordRow({ confidence: 3 })).summary).toContain("100% confidence");
    expect(normalizePendingStatRecord(statRecordRow({ confidence: -1 })).summary).toContain("0% confidence");
  });

  it("maps review outcomes", () => {
    expect(normalizePendingStatRecord(statRecordRow({ status: "approved" })).status).toBe("resolved");
    expect(normalizePendingStatRecord(statRecordRow({ status: "rejected" })).status).toBe("denied");
    expect(normalizePendingStatRecord(statRecordRow({ status: "whatever" })).status).toBe("open");
  });
});

describe("normalizeRegistration", () => {
  it("uses the form name and links the tracker profile", () => {
    const t = normalizeRegistration(registrationRow());
    expect(t.title).toBe("Registration: Ada Vale");
    expect(t.summary).toBe("Player registration from @newplayer (Mid / Support).");
    expect(t.registrationIgn).toBe("AdaSMITE");
    expect(t.privacy).toBe("public");
    expect(t.links).toEqual([
      { label: "Tracker profile", href: "https://tracker.gg/p/ada", external: true },
    ]);
    expect(t.workflow).toEqual({
      kind: "site",
      href: "/admin/registrations",
      label: "Handle in Registrations",
    });
  });

  it("falls back to Discord names when form_data is malformed", () => {
    for (const formData of [null, "not-an-object", 42, ["array"], { name: 7, tracker_url: 1 }]) {
      const t = normalizeRegistration(registrationRow({ form_data: formData as never }));
      expect(t.title).toBe("Registration: New Player");
      expect(t.links).toEqual([]);
    }
  });

  it("ignores unsafe tracker URLs", () => {
    const t = normalizeRegistration(
      registrationRow({ form_data: { name: "Ada", tracker_url: "javascript:alert(1)" } }),
    );
    expect(t.links).toEqual([]);
  });

  it("maps approval and rejection", () => {
    expect(normalizeRegistration(registrationRow({ status: "approved" })).status).toBe("resolved");
    expect(normalizeRegistration(registrationRow({ status: "rejected" })).status).toBe("denied");
  });

  it("uses the review timestamp as the update time once reviewed", () => {
    const t = normalizeRegistration(
      registrationRow({ status: "approved", reviewed_at: "2026-07-05T12:00:00Z" }),
    );
    expect(t.updatedAt).toBe("2026-07-05T12:00:00Z");
    expect(t.timeline.some((e) => e.label === "Reviewed")).toBe(true);
  });
});

describe("normalizeMatchReport", () => {
  it("normalizes a report awaiting admin review", () => {
    const t = normalizeMatchReport(matchReportRow());
    expect(t.category).toBe("match_report");
    expect(t.status).toBe("open");
    expect(t.priority).toBe("high");
    expect(t.summary).toBe("Reported score 2 to 1 over 3 games.");
    expect(t.links).toHaveLength(2);
    expect(t.workflow).toEqual({
      kind: "site",
      href: "/admin/match-report",
      label: "Handle in Match Report",
    });
  });

  it("marks extraction in progress as claimed by automation", () => {
    const t = normalizeMatchReport(matchReportRow({ status: "extracting", home_score: null, away_score: null }));
    expect(t.status).toBe("claimed");
    expect(t.claimedBy).toBe("Automated extraction");
    expect(t.summary).toBe("Match screenshots submitted, awaiting extraction and review.");
  });

  it("maps done reports to resolved with normal priority", () => {
    const t = normalizeMatchReport(matchReportRow({ status: "done", reviewed_at: "2026-07-06T09:00:00Z" }));
    expect(t.status).toBe("resolved");
    expect(t.priority).toBe("normal");
    expect(t.updatedAt).toBe("2026-07-06T09:00:00Z");
  });

  it("caps screenshot links at five and drops unsafe URLs", () => {
    const urls = [
      "https://cdn.example.com/1.png",
      "ftp://cdn.example.com/2.png",
      "https://cdn.example.com/3.png",
      "https://cdn.example.com/4.png",
      "https://cdn.example.com/5.png",
      "https://cdn.example.com/6.png",
      "https://cdn.example.com/7.png",
    ];
    const t = normalizeMatchReport(matchReportRow({ screenshot_urls: urls }));
    expect(t.links).toHaveLength(5);
    expect(t.links.every((l) => l.href.startsWith("https://"))).toBe(true);
  });
});

describe("normalizeTicketSources", () => {
  it("returns an empty queue for empty sources", () => {
    expect(
      normalizeTicketSources({
        pendingActions: [],
        pendingStatRecords: [],
        registrations: [],
        matchReports: [],
      }),
    ).toEqual([]);
  });

  it("combines every source into one queue", () => {
    const tickets = normalizeTicketSources({
      pendingActions: [pendingActionRow()],
      pendingStatRecords: [statRecordRow()],
      registrations: [registrationRow()],
      matchReports: [matchReportRow()],
    });
    expect(tickets.map((t) => t.category).sort()).toEqual([
      "match_report",
      "operation",
      "registration",
      "stat_review",
    ]);
  });
});

describe("sortTickets", () => {
  it("puts urgent and SLA-bound work first, then oldest unresolved, then terminal", () => {
    const urgent = ticket({ id: "a:urgent", priority: "urgent", createdAt: "2026-07-10T00:00:00Z" });
    const slaSoon = ticket({ id: "a:sla-soon", slaDeadline: "2026-07-11T00:00:00Z", createdAt: "2026-07-10T00:00:00Z" });
    const slaLater = ticket({ id: "a:sla-later", slaDeadline: "2026-07-20T00:00:00Z", createdAt: "2026-07-01T00:00:00Z" });
    const oldOpen = ticket({ id: "a:old-open", createdAt: "2026-06-01T00:00:00Z" });
    const newOpen = ticket({ id: "a:new-open", createdAt: "2026-07-09T00:00:00Z" });
    const resolved = ticket({ id: "a:resolved", status: "resolved", updatedAt: "2026-07-08T00:00:00Z" });

    const sorted = sortTickets([resolved, newOpen, slaLater, oldOpen, urgent, slaSoon]);
    expect(sorted.map((t) => t.id)).toEqual([
      "a:sla-soon",
      "a:sla-later",
      "a:urgent",
      "a:old-open",
      "a:new-open",
      "a:resolved",
    ]);
  });

  it("sorts terminal tickets by most recent activity", () => {
    const older = ticket({ id: "a:older", status: "denied", updatedAt: "2026-07-01T00:00:00Z" });
    const newer = ticket({ id: "a:newer", status: "resolved", updatedAt: "2026-07-05T00:00:00Z" });
    expect(sortTickets([older, newer]).map((t) => t.id)).toEqual(["a:newer", "a:older"]);
  });

  it("breaks ties deterministically by ticket id", () => {
    const same = { createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-01T00:00:00Z" };
    const b = ticket({ id: "b:tie", ...same });
    const a = ticket({ id: "a:tie", ...same });
    expect(sortTickets([b, a]).map((t) => t.id)).toEqual(["a:tie", "b:tie"]);
    expect(sortTickets([a, b]).map((t) => t.id)).toEqual(["a:tie", "b:tie"]);
  });
});

describe("applyTicketFilters and search", () => {
  const openReg = ticket({ id: "r:1", displayId: "RG-11111111" });
  const resolvedReg = ticket({ id: "r:2", displayId: "RG-22222222", status: "resolved" });
  const claimedReport = normalizeMatchReport(matchReportRow({ status: "extracting" }));
  const openAction = normalizePendingAction(pendingActionRow());

  const all = [openReg, resolvedReg, claimedReport, openAction];

  it("hides terminal tickets under the default unresolved filter", () => {
    const filtered = applyTicketFilters(all, DEFAULT_TICKET_FILTERS);
    expect(filtered.map((t) => t.id)).not.toContain("r:2");
    expect(filtered).toHaveLength(3);
  });

  it("combines category, division, and assignment filters", () => {
    const filtered = applyTicketFilters(all, {
      ...DEFAULT_TICKET_FILTERS,
      category: "match_report",
      divisionId: "lunar",
      assignment: "claimed",
    });
    expect(filtered).toEqual([claimedReport]);

    const none = applyTicketFilters(all, {
      ...DEFAULT_TICKET_FILTERS,
      category: "match_report",
      divisionId: "solar",
      assignment: "claimed",
    });
    expect(none).toEqual([]);
  });

  it("filters by explicit status and priority", () => {
    expect(
      applyTicketFilters(all, { ...DEFAULT_TICKET_FILTERS, status: "resolved" }),
    ).toEqual([resolvedReg]);
    expect(
      applyTicketFilters(all, { ...DEFAULT_TICKET_FILTERS, priority: "high" }).map((t) => t.category),
    ).toContain("operation");
  });

  it("searches ticket id, title, match reference, and summary case-insensitively", () => {
    expect(searchMatches(openReg, "rg-1111")).toBe(true);
    expect(searchMatches(openReg, "ada vale")).toBe(true);
    expect(searchMatches(openAction, "MMMM2222")).toBe(true);
    expect(searchMatches(openAction, "reviewed in discord")).toBe(true);
    expect(searchMatches(openReg, "no-such-thing")).toBe(false);
    expect(searchMatches(openReg, "  ")).toBe(true);
  });

  it("applies search together with filters", () => {
    const filtered = applyTicketFilters(all, {
      ...DEFAULT_TICKET_FILTERS,
      status: "all",
      search: "rg-22222222",
    });
    expect(filtered).toEqual([resolvedReg]);
  });
});

describe("getTicketCounts", () => {
  it("counts open (including claimed), urgent, needs info, and resolved", () => {
    const counts = getTicketCounts([
      ticket({ id: "t:1", status: "open" }),
      ticket({ id: "t:2", status: "claimed" }),
      ticket({ id: "t:3", status: "needs_info" }),
      ticket({ id: "t:4", status: "resolved" }),
      ticket({ id: "t:5", status: "open", priority: "urgent" }),
      ticket({ id: "t:6", status: "resolved", priority: "urgent" }),
    ]);
    expect(counts).toEqual({ open: 3, urgent: 1, needsInfo: 1, resolved: 2 });
  });
});
