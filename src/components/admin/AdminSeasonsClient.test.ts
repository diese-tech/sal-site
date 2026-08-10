import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Season } from "@/types/league";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { AdminSeasonsClient } from "./AdminSeasonsClient";

const seasons: Season[] = [{
  id: "s2",
  name: "Season 2",
  status: "active",
  isCurrent: false,
  startDate: "2026-08-01",
  endDate: "2026-12-01",
  currentWeek: 2,
}];

describe("AdminSeasonsClient authorization affordances", () => {
  it("shows routine operations but no structural controls to a regular admin", () => {
    const html = renderToStaticMarkup(createElement(AdminSeasonsClient, { seasons, isSuperAdmin: false }));

    expect(html).toContain("Manage Roster");
    expect(html).toContain("Advance Week");
    expect(html).not.toContain("+ New Season");
    expect(html).not.toContain("Make Site Current");
    expect(html).not.toContain(">Edit<");
    expect(html).not.toContain("Ingest from Preseason");
    expect(html).not.toContain("post-season</button>");
  });

  it("shows structural season controls to a superadmin", () => {
    const html = renderToStaticMarkup(createElement(AdminSeasonsClient, { seasons, isSuperAdmin: true }));

    expect(html).toContain("+ New Season");
    expect(html).toContain("Make Site Current");
    expect(html).toContain(">Edit<");
    expect(html).toContain("Ingest from Preseason");
    expect(html).toContain("post-season</button>");
  });
});
