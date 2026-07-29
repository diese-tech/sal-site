import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminTicket } from "@/types/admin-ticket";
import { normalizeRegistration, type RegistrationSourceRow } from "@/lib/admin-ticket-model";

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: navigationMocks.refresh }),
  useSearchParams: () => navigationMocks.searchParams,
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) =>
    createElement("a", props, children),
}));
vi.mock("@/components/admin/AdminTicketActions", () => ({
  AdminTicketActions: () => null,
}));

import { AdminTicketsClient } from "@/components/admin/AdminTicketsClient";

function registrationRow(overrides: Partial<RegistrationSourceRow> = {}): RegistrationSourceRow {
  return {
    id: "cccc1111-0000-0000-0000-000000000001",
    status: "pending",
    created_at: "2026-07-03T10:00:00Z",
    reviewed_at: null,
    reviewer_note: null,
    season_id: null,
    player_id: null,
    discord_username: "newplayer",
    discord_display_name: "New Player",
    form_data: { name: "New Player" },
    ...overrides,
  };
}

const TICKETS: AdminTicket[] = [
  normalizeRegistration(registrationRow()),
  normalizeRegistration(
    registrationRow({ id: "cccc2222-0000-0000-0000-000000000002", discord_username: "otherplayer" }),
  ),
];

function renderQueue(query: string, tickets: AdminTicket[] = TICKETS) {
  navigationMocks.searchParams = new URLSearchParams(query);
  return renderToStaticMarkup(
    createElement(AdminTicketsClient, {
      tickets,
      sourceHealth: [],
      seasonNames: {},
      divisionNames: {},
      capabilities: { canViewQueue: true, canActOnTickets: false, canViewRestrictedIdentities: false },
    }),
  );
}

beforeEach(() => {
  navigationMocks.searchParams = new URLSearchParams();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AdminTicketsClient deep-link selection", () => {
  it("opens the detail panel on first render for a valid ?ticket= internal id", () => {
    const html = renderQueue("ticket=registration%3Acccc1111-0000-0000-0000-000000000001");

    // Detail-only content renders without any click, and the queue row is marked current.
    expect(html).toContain("Where this is handled");
    expect(html).toContain('aria-current="true"');
    expect(html).not.toContain("Select a ticket to see its details.");
  });

  it("opens the detail panel for a displayId deep link, case-insensitively", () => {
    const html = renderQueue("ticket=rg-cccc1111");

    expect(html).toContain("Where this is handled");
    expect(html).toContain('aria-current="true"');
  });

  it("shows an honest not-found state for an unknown or stale ticket id", () => {
    const html = renderQueue("ticket=registration%3Agone");

    expect(html).toContain("Ticket not found");
    expect(html).toContain("registration:gone");
    expect(html).not.toContain("Where this is handled");
    expect(html).not.toContain("Select a ticket to see its details.");
  });

  it("renders the neutral placeholder when no ticket is requested", () => {
    const html = renderQueue("");

    expect(html).toContain("Select a ticket to see its details.");
    expect(html).not.toContain("Ticket not found");
  });
});

// Both fixture registrations are created 2026-07-03T10:00Z, so their derived
// 72h SLA deadline is 2026-07-06T10:00Z.
describe("AdminTicketsClient SLA affordance", () => {
  it("shows no SLA chip while the deadline is comfortably ahead", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T10:00:00Z"));

    const html = renderQueue("");
    expect(html).not.toContain("SLA at risk");
    expect(html).not.toContain("SLA overdue");
  });

  it("marks rows at risk inside the final 12h window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T00:00:00Z"));

    const html = renderQueue("");
    expect(html).toContain("SLA at risk");
    expect(html).not.toContain("SLA overdue");
  });

  it("marks rows overdue once the deadline passes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-07T00:00:00Z"));

    const html = renderQueue("");
    expect(html).toContain("SLA overdue");
    expect(html).not.toContain("SLA at risk");
  });

  it("never flags a resolved ticket even when a stale deadline remains on it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-07T00:00:00Z"));

    // Simulates an optimistic client-side resolve, which flips status without
    // clearing the derived deadline.
    const resolved: AdminTicket = {
      ...normalizeRegistration(registrationRow()),
      status: "resolved",
      slaDeadline: "2026-07-06T10:00:00.000Z",
    };
    const html = renderQueue("status=all", [resolved]);
    expect(html).not.toContain("SLA overdue");
    expect(html).not.toContain("SLA at risk");
  });
});
