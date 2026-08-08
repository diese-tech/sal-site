import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AdminTicket, TicketViewerCapabilities } from "@/types/admin-ticket";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) =>
    createElement("a", props, children),
}));

import { AdminTicketActions } from "./AdminTicketActions";

const canAct: TicketViewerCapabilities = {
  canViewQueue: true,
  canActOnTickets: true,
  canViewRestrictedIdentities: false,
};

function ticket(category: "operation" | "stat_review"): AdminTicket {
  return {
    id: `${category}:source-1`,
    sourceId: "source-1",
    displayId: category === "operation" ? "OP-SOURCE1" : "ST-SOURCE1",
    category,
    ...(category === "operation"
      ? { operationType: "admin_review" }
      : { statPlayerId: "player-1" }),
    status: "open",
    sourceStatus: "pending",
    priority: "normal",
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    title: "Admin review request",
    summary: "Awaiting review.",
    privacy: "identity_restricted",
    links: [],
    timeline: [],
    workflow: { kind: "discord", label: "Managed through Discord" },
  };
}

function renderActions(
  value: AdminTicket,
  capabilities: TicketViewerCapabilities = canAct,
) {
  return renderToStaticMarkup(
    createElement(AdminTicketActions, {
      ticket: value,
      capabilities,
      onTicketChange: vi.fn(),
      onActionSuccess: vi.fn(),
    }),
  );
}

describe("AdminTicketActions Wave 2 controls", () => {
  it("offers operation decisions backed by the audited resolver", () => {
    const markup = renderActions(ticket("operation"));

    expect(markup).toContain("Approve");
    expect(markup).toContain("Needs Info");
    expect(markup).toContain("Deny");
    expect(markup).toContain("audited operation resolver");
  });

  it("offers stat approval and denial without presenting a correction editor", () => {
    const markup = renderActions(ticket("stat_review"));

    expect(markup).toContain("Approve Stats");
    expect(markup).toContain("Deny Stats");
    expect(markup).toContain("official stat record");
    expect(markup).not.toContain("Needs Info");
  });

  it("renders no action buttons without the capability", () => {
    const markup = renderActions(ticket("operation"), {
      ...canAct,
      canActOnTickets: false,
    });

    expect(markup).toContain("read-only for your account");
    expect(markup).not.toContain("<button");
  });

  it("suppresses approvals the database contract cannot apply", () => {
    const aliasMarkup = renderActions({
      ...ticket("operation"),
      operationType: "alias_change",
    });
    const unlinkedStatMarkup = renderActions({
      ...ticket("stat_review"),
      statPlayerId: undefined,
    });

    expect(aliasMarkup).not.toContain(">Approve</button>");
    expect(aliasMarkup).toContain("cannot be approved by the canonical resolver");
    expect(unlinkedStatMarkup).not.toContain("Approve Stats");
    expect(unlinkedStatMarkup).toContain("not linked to a player");
  });
});
