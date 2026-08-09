import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LeaguePlayer } from "@/types/league";

const authUser = {
  id: "oauth-user",
  app_metadata: {},
  user_metadata: {
    provider_id: "attacker-id",
    name: "attacker#0",
    full_name: "Pringle Imperialist",
  },
  identities: [{
    id: "discord-123",
    provider: "discord",
    identity_data: { name: "pringleimperialist#0" },
  }],
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00Z",
} as unknown as User;

const importedCaptain: LeaguePlayer = {
  id: "player-pringle-import",
  orgId: "something-spicy",
  discordUsername: "pringleimperialist",
  ign: "Pringle Imperialist",
  avatarInitials: "PI",
  avatarGradient: "from-cyan-500 to-indigo-500",
  primaryRole: "Support",
  secondaryRoles: ["Solo"],
  isStarter: true,
  isCaptain: true,
  divisionId: "terra",
  status: "org-affiliated",
};

const getPlayerClaimCandidateByDiscordUsername = vi.fn();
let receivedProps: Record<string, unknown> | null = null;

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/supabase-auth-server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase-auth-server")>("@/lib/supabase-auth-server");
  return {
    getAuthUser: () => Promise.resolve(authUser),
    getDiscordId: actual.getDiscordId,
    getDiscordUsername: actual.getDiscordUsername,
    getDiscordDisplayName: actual.getDiscordDisplayName,
  };
});

vi.mock("@/lib/league-data", () => ({
  getLeagueData: vi.fn().mockResolvedValue({ players: [] }),
  getFormFields: vi.fn().mockResolvedValue([]),
  getPlayerByDiscordId: vi.fn().mockResolvedValue(null),
  getRegistrationByDiscordId: vi.fn().mockResolvedValue(null),
  getPlayerClaimCandidateByDiscordUsername,
}));

vi.mock("@/components/auth/RegisterClient", () => ({
  RegisterClient: (props: Record<string, unknown>) => {
    receivedProps = props;
    return createElement("div", null, "registration view");
  },
}));

describe("registration page identity matching", () => {
  beforeEach(() => {
    receivedProps = null;
    getPlayerClaimCandidateByDiscordUsername.mockReset();
    getPlayerClaimCandidateByDiscordUsername.mockResolvedValue({
      kind: "available",
      player: importedCaptain,
    });
  });

  it("uses the hardened OIDC name fallback to find an imported player outside the current-season roster", async () => {
    const { default: RegisterPage } = await import("@/app/register/page");
    const page = await RegisterPage({ searchParams: Promise.resolve({}) });
    renderToStaticMarkup(page);

    expect(getPlayerClaimCandidateByDiscordUsername).toHaveBeenCalledWith("pringleimperialist");
    expect(receivedProps).toEqual(expect.objectContaining({
      claimedPlayer: null,
      matchedByUsername: importedCaptain,
    }));
  });

  it("fails closed instead of showing a new-registration path when username matching is ambiguous", async () => {
    getPlayerClaimCandidateByDiscordUsername.mockResolvedValueOnce({ kind: "ambiguous" });

    const { default: RegisterPage } = await import("@/app/register/page");
    const page = await RegisterPage({ searchParams: Promise.resolve({}) });
    renderToStaticMarkup(page);

    expect(receivedProps).toEqual(expect.objectContaining({
      matchedByUsername: null,
      identityBlocker: "ambiguous",
    }));
  });

  it("turns Not me into a reconciliation blocker instead of allowing a duplicate registration", async () => {
    const { default: RegisterPage } = await import("@/app/register/page");
    const page = await RegisterPage({ searchParams: Promise.resolve({ skip: "1" }) });
    renderToStaticMarkup(page);

    expect(receivedProps).toEqual(expect.objectContaining({
      matchedByUsername: null,
      identityBlocker: "declined-match",
    }));
  });
});
