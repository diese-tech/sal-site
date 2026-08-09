"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { AuthAccount } from "@/types/auth";
import { resolveDiscordUsername } from "@/lib/discord-identity";
import { getSupabaseBrowserClient, isPublicSupabaseConfigured } from "@/lib/supabase-browser";

export type AuthAccountState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; account: AuthAccount };

function isAuthAccount(value: unknown): value is AuthAccount {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { discordUsername?: unknown; player?: unknown };
  if (typeof candidate.discordUsername !== "string" || !candidate.discordUsername) return false;
  if (candidate.player === null) return true;
  if (!candidate.player || typeof candidate.player !== "object") return false;
  const player = candidate.player as { id?: unknown; ign?: unknown };
  return typeof player.id === "string" && !!player.id && typeof player.ign === "string" && !!player.ign;
}

export async function loadAuthAccount(request: typeof fetch = fetch): Promise<AuthAccountState> {
  try {
    const response = await request("/api/auth/account", { cache: "no-store" });
    if (!response.ok) return { status: "unavailable" };
    const account: unknown = await response.json();
    return isAuthAccount(account)
      ? { status: "ready", account }
      : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export function AuthButton() {
  const supabaseConfigured = isPublicSupabaseConfigured();
  const [user, setUser] = useState<User | null | undefined>(supabaseConfigured ? undefined : null);
  const [accountState, setAccountState] = useState<AuthAccountState>({ status: "loading" });
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!supabaseConfigured) return;
    const sb = getSupabaseBrowserClient();
    sb.auth.getUser().then(({ data: { user } }) => setUser(user ?? null));
    const { data: { subscription } } = sb.auth.onAuthStateChange((_, session) => {
      setAccountState({ status: "loading" });
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [supabaseConfigured]);

  useEffect(() => {
    if (!user) return;

    let active = true;
    loadAuthAccount().then((nextState) => {
      if (active) setAccountState(nextState);
    });

    return () => {
      active = false;
    };
  }, [user]);

  async function handleSignOut() {
    setMenuOpen(false);
    setAccountState({ status: "loading" });
    await fetch("/api/auth/signout", { method: "POST" });
    router.refresh();
  }

  if (user === undefined) return null;

  if (!user) {
    return (
      <Link
        href="/auth/signin"
        className="shrink-0 rounded-xl border border-indigo-400/35 bg-indigo-400/10 px-3 py-1.5 text-xs font-black uppercase text-indigo-200 transition hover:bg-indigo-400/20"
      >
        Sign In
      </Link>
    );
  }

  const username = accountState.status === "ready"
    ? accountState.account.discordUsername
    : resolveDiscordUsername(user) || "Player";
  const initials = username.slice(0, 2).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen((o) => !o)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs font-black uppercase text-slate-300 transition hover:bg-white/[0.08] hover:text-white sm:px-3"
      >
        <span className="grid h-5 w-5 place-items-center rounded-full bg-indigo-500/40 text-[0.55rem] font-black text-indigo-200">
          {initials}
        </span>
        <span className="hidden sm:inline">{username}</span>
      </button>

      {menuOpen && (
        <AuthMenu
          accountState={accountState}
          onClose={() => setMenuOpen(false)}
          onSignOut={handleSignOut}
        />
      )}
    </div>
  );
}

export function AuthMenu({
  accountState,
  onClose,
  onSignOut,
}: {
  accountState: AuthAccountState;
  onClose: () => void;
  onSignOut: () => void;
}) {
  return (
    <div role="menu" className="absolute right-0 top-full mt-1.5 w-48 rounded-xl border border-white/10 bg-slate-950/95 py-1 shadow-2xl backdrop-blur">
      {accountState.status === "loading" ? (
        <p className="px-3 py-2 text-xs font-semibold text-slate-500">Loading account...</p>
      ) : accountState.status === "unavailable" ? (
        <p className="px-3 py-2 text-xs font-semibold text-amber-300">Account unavailable. Try again shortly.</p>
      ) : (
        <Link
          href={accountState.account.player ? `/players/${accountState.account.player.id}` : "/register"}
          onClick={onClose}
          className="block px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
        >
          {accountState.account.player ? "My Profile" : "Registration / Claim"}
        </Link>
      )}
      <button
        onClick={onSignOut}
        className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-500 transition hover:bg-white/[0.06] hover:text-red-300"
      >
        Sign Out
      </button>
    </div>
  );
}
