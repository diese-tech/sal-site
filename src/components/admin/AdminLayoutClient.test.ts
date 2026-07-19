import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/tickets",
  useRouter: () => ({ refresh: navigationMocks.refresh }),
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) =>
    createElement("a", props, children),
}));
vi.mock("@/components/admin/AdminLogoutButton", () => ({
  AdminLogoutButton: () => createElement("button", null, "Log out"),
}));

import { AdminLayoutClient } from "@/components/admin/AdminLayoutClient";

const TestableAdminLayoutClient = AdminLayoutClient as ComponentType<{
  children?: ReactNode;
  isMockFallback: boolean;
  ticketBadgeCount?: number | null;
}>;

function renderLayout(ticketBadgeCount: number | null) {
  return renderToStaticMarkup(
    createElement(
      TestableAdminLayoutClient,
      { isMockFallback: false, ticketBadgeCount },
      createElement("main", null, "Queue"),
    ),
  );
}

describe("AdminLayoutClient ticket badge", () => {
  it("renders a positive unresolved count on the Tickets nav item", () => {
    const html = renderLayout(6);

    expect(html).toContain('aria-label="6 unresolved tickets"');
  });

  it("hides the ticket badge when the unresolved count is zero", () => {
    const html = renderLayout(0);

    expect(html).not.toContain("unresolved ticket");
  });

  it("omits the ticket badge when the server cannot produce a trustworthy count", () => {
    const html = renderLayout(null);

    expect(html).not.toContain("unresolved ticket");
  });
});
