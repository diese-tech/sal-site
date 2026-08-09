import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RegisterClient } from "./RegisterClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const matchedPlayer = {
  id: "imported-captain",
  discordUsername: "captain_handle",
  ign: "Imported Captain",
  avatarInitials: "IC",
  avatarGradient: "from-cyan-500 to-indigo-500",
  primaryRole: "Support" as const,
  secondaryRoles: ["Solo" as const],
  isStarter: true,
  isCaptain: true,
  divisionId: "terra" as const,
  status: "org-affiliated" as const,
};

describe("RegisterClient identity containment", () => {
  it("offers the imported profile claim even when a duplicate registration is already pending", () => {
    const html = renderToStaticMarkup(createElement(RegisterClient, {
      discordDisplayName: "Imported Captain",
      claimedPlayer: null,
      matchedByUsername: matchedPlayer,
      identityBlocker: null,
      existingRegistration: {
        id: "duplicate-registration",
        discordId: "discord-123",
        discordUsername: "captain_handle",
        formData: {},
        status: "pending",
        createdAt: "2026-08-09T00:00:00Z",
      },
      formFields: [],
    }));

    expect(html).toContain("Yes, this is me");
    expect(html).not.toContain("Registration submitted");
  });
});
