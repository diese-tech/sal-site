import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AuthMenu, loadAuthAccount } from "./AuthButton";

describe("AuthMenu", () => {
  it("links a claimed Discord account directly to its player profile", () => {
    const html = renderToStaticMarkup(createElement(AuthMenu, {
      accountState: {
        status: "ready",
        account: {
          discordUsername: "pringleimperialist",
          player: { id: "player-pringle-import", ign: "Pringle Imperialist" },
        },
      },
      onClose: vi.fn(),
      onSignOut: vi.fn(),
    }));

    expect(html).toContain('href="/players/player-pringle-import"');
    expect(html).toContain("My Profile");
    expect(html).not.toContain("My Registration");
  });

  it("sends an unlinked account to the safe registration and claim flow", () => {
    const html = renderToStaticMarkup(createElement(AuthMenu, {
      accountState: {
        status: "ready",
        account: { discordUsername: "new_player", player: null },
      },
      onClose: vi.fn(),
      onSignOut: vi.fn(),
    }));

    expect(html).toContain('href="/register"');
    expect(html).toContain("Registration / Claim");
  });

  it("shows an unavailable state without a registration link when account lookup fails", () => {
    const html = renderToStaticMarkup(createElement(AuthMenu, {
      accountState: { status: "unavailable" },
      onClose: vi.fn(),
      onSignOut: vi.fn(),
    }));

    expect(html).toContain("Account unavailable");
    expect(html).not.toContain('href="/register"');
  });
});

describe("loadAuthAccount", () => {
  it.each([401, 500])("fails closed on an HTTP %s response", async (status) => {
    const request = vi.fn().mockResolvedValue(new Response("error", { status }));
    await expect(loadAuthAccount(request)).resolves.toEqual({ status: "unavailable" });
  });

  it("fails closed on a network error", async () => {
    const request = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(loadAuthAccount(request)).resolves.toEqual({ status: "unavailable" });
  });

  it("treats only a valid 200 player:null response as an unlinked account", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({
      discordUsername: "new_player",
      player: null,
    }));

    await expect(loadAuthAccount(request)).resolves.toEqual({
      status: "ready",
      account: { discordUsername: "new_player", player: null },
    });
  });

  it("fails closed on a malformed 200 response", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ player: null }));
    await expect(loadAuthAccount(request)).resolves.toEqual({ status: "unavailable" });
  });
});
