import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DraftRoom } from "@/types/draft";
import type { Division, Season } from "@/types/league";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) =>
    createElement("a", props, children),
}));

import { AdminDraftListClient } from "./AdminDraftListClient";

const season: Season = {
  id: "s2",
  name: "Season 2",
  status: "pre-season",
  isCurrent: true,
  startDate: "2026-08-01",
  endDate: "2026-12-01",
  currentWeek: 0,
};
const divisions: Division[] = [
  { id: "terra", name: "Terra", description: "", tier: 1, accentColor: "#22d3ee" },
];

function room(status: DraftRoom["status"]): DraftRoom {
  return {
    id: `room-${status}`,
    seasonId: "s2",
    divisionId: "terra",
    status,
    rounds: 5,
    pickTimerSeconds: 120,
    baseOrder: ["org-a"],
    currentPickIndex: status === "pending" ? 0 : 1,
    createdAt: "2026-08-09T00:00:00Z",
  };
}

describe("AdminDraftListClient lifecycle controls", () => {
  it("shows guarded recovery actions for pending and opened rooms", () => {
    const html = renderToStaticMarkup(createElement(AdminDraftListClient, {
      rooms: [room("pending"), room("active"), room("paused")],
      season,
      divisions,
    }));

    expect(html).toContain("Delete Pending");
    expect(html.match(/Void Room/g)).toHaveLength(2);
    expect(html).toContain("confirmation");
  });

  it("preserves completed and voided history without destructive controls", () => {
    const html = renderToStaticMarkup(createElement(AdminDraftListClient, {
      rooms: [room("complete"), { ...room("voided"), voidReason: "Wrong order" }],
      season,
      divisions,
    }));

    expect(html).not.toContain("Delete Pending");
    expect(html).not.toContain("Void Room");
    expect(html).toContain("Wrong order");
  });
});
