import { describe, expect, it } from "vitest";
import type { AdminTicket } from "@/types/admin-ticket";
import { DEFAULT_TICKET_FILTERS } from "@/types/admin-ticket";
import { buildQueryString, parseFilters, resolveTicketSelection } from "@/lib/admin-ticket-links";
import { normalizeRegistration, type RegistrationSourceRow } from "@/lib/admin-ticket-model";

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
    form_data: { name: "New Player", ign: "NP#123" },
    ...overrides,
  };
}

function ticket(overrides: Partial<AdminTicket>): AdminTicket {
  return {
    ...normalizeRegistration(registrationRow()),
    ...overrides,
  };
}

const QUEUE: AdminTicket[] = [
  ticket({ id: "registration:cccc1111", displayId: "RG-CCCC1111" }),
  ticket({ id: "match_report:dddd2222", displayId: "MR-DDDD2222", category: "match_report" }),
];

describe("resolveTicketSelection", () => {
  it("resolves a canonical internal id (the stable deep-link form)", () => {
    const selection = resolveTicketSelection(QUEUE, "match_report:dddd2222");
    expect(selection.kind).toBe("found");
    expect(selection.ticket?.id).toBe("match_report:dddd2222");
  });

  it("resolves a displayId case-insensitively as a convenience fallback", () => {
    const selection = resolveTicketSelection(QUEUE, "rg-cccc1111");
    expect(selection.kind).toBe("found");
    expect(selection.ticket?.id).toBe("registration:cccc1111");
  });

  it("reports an unknown or stale id as not_found instead of silently deselecting", () => {
    const selection = resolveTicketSelection(QUEUE, "registration:gone-9999");
    expect(selection).toEqual({ kind: "not_found", ticket: null, requestedId: "registration:gone-9999" });
  });

  it("treats a missing ticket param as no selection", () => {
    expect(resolveTicketSelection(QUEUE, null)).toEqual({ kind: "none", ticket: null, requestedId: null });
  });

  it("prefers an exact internal id match over a displayId match", () => {
    const collision = [
      ticket({ id: "RG-CCCC1111", displayId: "RG-OTHER000" }),
      ticket({ id: "registration:cccc1111", displayId: "RG-CCCC1111" }),
    ];
    const selection = resolveTicketSelection(collision, "RG-CCCC1111");
    expect(selection.kind).toBe("found");
    expect(selection.ticket?.id).toBe("RG-CCCC1111");
  });
});

describe("parseFilters / buildQueryString round-trip", () => {
  it("keeps the ticket param and non-default filters through a round-trip", () => {
    const query = buildQueryString(
      { ...DEFAULT_TICKET_FILTERS, status: "open", search: "np" },
      "registration:cccc1111",
    );
    const params = new URLSearchParams(query);
    expect(params.get("ticket")).toBe("registration:cccc1111");
    expect(parseFilters(params)).toEqual({ ...DEFAULT_TICKET_FILTERS, status: "open", search: "np" });
  });

  it("omits default filters and the ticket param when nothing is selected", () => {
    expect(buildQueryString(DEFAULT_TICKET_FILTERS, null)).toBe("");
  });

  it("falls back to default filters on unknown values", () => {
    const params = new URLSearchParams("status=bogus&priority=extreme&assignment=nobody&category=nope");
    expect(parseFilters(params)).toEqual(DEFAULT_TICKET_FILTERS);
  });
});
