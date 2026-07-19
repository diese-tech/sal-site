import { createElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkIsAdminDataMock: vi.fn().mockResolvedValue(false),
  getUnresolvedAdminTicketCount: vi.fn().mockResolvedValue(9),
  getAdminSession: vi.fn().mockResolvedValue({
    discordId: "admin-1",
    role: "admin",
    exp: Date.now() + 60_000,
  }),
}));

vi.mock("@/lib/league-data", () => ({
  checkIsAdminDataMock: mocks.checkIsAdminDataMock,
}));
vi.mock("@/lib/admin-ticket-count", () => ({
  getUnresolvedAdminTicketCount: mocks.getUnresolvedAdminTicketCount,
}));
vi.mock("@/lib/admin-auth", () => ({
  getAdminSession: mocks.getAdminSession,
}));

import AdminLayout from "@/app/admin/layout";

describe("AdminLayout ticket count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminSession.mockResolvedValue({
      discordId: "admin-1",
      role: "admin",
      exp: Date.now() + 60_000,
    });
  });

  it("loads the unresolved count on the server and passes it to the client shell", async () => {
    const element = (await AdminLayout({
      children: createElement("main", null, "Queue"),
    })) as ReactElement<{ ticketBadgeCount?: number | null }>;

    expect(mocks.getUnresolvedAdminTicketCount).toHaveBeenCalledOnce();
    expect(element.props.ticketBadgeCount).toBe(9);
  });

  it("skips admin data and ticket counts when no admin session exists", async () => {
    mocks.getAdminSession.mockResolvedValueOnce(null);

    const element = (await AdminLayout({
      children: createElement("main", null, "Login"),
    })) as ReactElement<{ isMockFallback: boolean; ticketBadgeCount?: number | null }>;

    expect(mocks.checkIsAdminDataMock).not.toHaveBeenCalled();
    expect(mocks.getUnresolvedAdminTicketCount).not.toHaveBeenCalled();
    expect(element.props.isMockFallback).toBe(false);
    expect(element.props.ticketBadgeCount).toBeNull();
  });
});
