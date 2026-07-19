import { createElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkIsAdminDataMock: vi.fn().mockResolvedValue(false),
  getUnresolvedAdminTicketCount: vi.fn().mockResolvedValue(9),
}));

vi.mock("@/lib/league-data", () => ({
  checkIsAdminDataMock: mocks.checkIsAdminDataMock,
}));
vi.mock("@/lib/admin-ticket-count", () => ({
  getUnresolvedAdminTicketCount: mocks.getUnresolvedAdminTicketCount,
}));

import AdminLayout from "@/app/admin/layout";

describe("AdminLayout ticket count", () => {
  it("loads the unresolved count on the server and passes it to the client shell", async () => {
    const element = (await AdminLayout({
      children: createElement("main", null, "Queue"),
    })) as ReactElement<{ ticketBadgeCount?: number | null }>;

    expect(mocks.getUnresolvedAdminTicketCount).toHaveBeenCalledOnce();
    expect(element.props.ticketBadgeCount).toBe(9);
  });
});
