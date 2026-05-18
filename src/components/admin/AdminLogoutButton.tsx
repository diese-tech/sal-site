"use client";

import { useRouter } from "next/navigation";

export function AdminLogoutButton() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button onClick={logout} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-black uppercase text-slate-400 transition hover:bg-white/[0.08] hover:text-white">
      Logout
    </button>
  );
}
