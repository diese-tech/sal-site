import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DraftState } from "@/types/draft";
import type { Org } from "@/types/league";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { AdminDraftRoomClient } from "./AdminDraftRoomClient";

const state: DraftState = {
  room: {
    id: "room-1",
    seasonId: "season-2",
    divisionId: "terra",
    status: "pending",
    rounds: 2,
    pickTimerSeconds: 120,
    baseOrder: ["org-a", "org-b"],
    currentPickIndex: 0,
    createdAt: "2026-08-09T00:00:00Z",
  },
  picks: [],
  pickSequence: ["org-a", "org-b", "org-b", "org-a"],
  currentOrgId: "org-a",
  totalPicks: 4,
  secondsRemaining: null,
};

function org(id: string, name: string): Org {
  return {
    id,
    name,
    tag: id.toUpperCase(),
    divisionId: "terra",
    logoInitials: "O",
    logoGradient: "",
    primaryColor: "#fff",
    accentGradient: "",
  };
}

describe("AdminDraftRoomClient delegated draft access", () => {
  it("offers a separate room-and-org-scoped link for each captain or org owner", () => {
    const html = renderToStaticMarkup(createElement(AdminDraftRoomClient, {
      state,
      orgs: [org("org-a", "Alpha"), org("org-b", "Beta")],
      players: [],
    }));

    expect(html).toContain("Captain / Org Owner Access");
    expect(html).toContain("Generate Alpha - TD access link");
    expect(html).toContain("Generate Beta - TD access link");
    expect(html).toContain("one-time");
    expect(html).toContain("only this organization&#x27;s seat");
    expect(html).toContain('href="/draft/room-1"');
    expect(html).toContain("Open Public Draftboard");
  });
});
