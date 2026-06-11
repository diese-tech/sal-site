"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; exact?: boolean };
type NavGroup = { title: string; items: NavItem[] };

const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    title: "League",
    items: [
      { href: "/admin", label: "Overview", exact: true },
      { href: "/admin/seasons", label: "Seasons" },
      { href: "/admin/standings", label: "Standings" },
    ],
  },
  {
    title: "Competition",
    items: [
      { href: "/admin/matches", label: "Schedule" },
      { href: "/admin/match-report", label: "Match Report" },
      { href: "/admin/draft", label: "Draft" },
    ],
  },
  {
    title: "People",
    items: [
      { href: "/admin/teams", label: "Teams" },
      { href: "/admin/players", label: "Roster" },
      { href: "/admin/registrations", label: "Registrations" },
      { href: "/admin/import", label: "Import" },
    ],
  },
  {
    title: "Site",
    items: [
      { href: "/admin/announcements", label: "Announcements" },
      { href: "/admin/form-fields", label: "Form Fields" },
    ],
  },
  {
    title: "System",
    items: [{ href: "/admin/audit", label: "Audit Log" }],
  },
];

function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-emerald-300/35 bg-emerald-300/10 text-[0.6rem] font-black text-emerald-100">
        ADM
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-black uppercase text-white">SAL Admin</p>
        <p className="truncate text-[0.6rem] font-black uppercase tracking-wider text-cyan-300/60">League Control Center</p>
      </div>
    </Link>
  );
}

function NavGroups({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));
  return (
    <nav className="space-y-5">
      {ADMIN_NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="mb-1.5 px-3 text-[0.6rem] font-black uppercase tracking-[0.18em] text-slate-600">{group.title}</p>
          <div className="space-y-0.5">
            {group.items.map(({ href, label, exact }) => {
              const active = isActive(href, exact);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  className={cn(
                    "relative flex items-center rounded-lg px-3 py-2 text-xs font-black uppercase transition",
                    active
                      ? "bg-cyan-300/12 text-cyan-100"
                      : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-100",
                  )}
                >
                  {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-cyan-300" />}
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function NavFooter() {
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/"
        className="flex-1 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-center text-xs font-black uppercase text-slate-300 transition hover:border-white/25 hover:bg-white/[0.10] hover:text-white"
      >
        ← Site
      </Link>
      <AdminLogoutButton />
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const isLogin = pathname === "/admin/login";

  if (isLogin) return children;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_18%_0%,rgba(34,211,238,0.12),transparent_28rem),radial-gradient(circle_at_80%_8%,rgba(16,185,129,0.12),transparent_28rem),#05070d]">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-cyan-300/10 bg-slate-950/95 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Open admin menu"
          className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-slate-200"
        >
          <span className="block h-0.5 w-5 rounded bg-current" />
          <span className="mt-1 block h-0.5 w-5 rounded bg-current" />
          <span className="mt-1 block h-0.5 w-5 rounded bg-current" />
        </button>
      </header>

      {/* Mobile slide-over menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-white/10 bg-slate-950 shadow-2xl shadow-black/60">
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
              <Brand />
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Close admin menu"
                className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-black uppercase text-slate-300"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <NavGroups pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            </div>
            <div className="border-t border-white/8 px-3 py-3">
              <NavFooter />
            </div>
          </div>
        </div>
      )}

      <div className="flex">
        {/* Desktop sidebar — every section visible, no scrolling */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-cyan-300/10 bg-slate-950/80 backdrop-blur lg:flex">
          <div className="border-b border-white/8 px-4 py-4">
            <Brand />
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <NavGroups pathname={pathname} />
          </div>
          <div className="border-t border-white/8 px-3 py-3">
            <NavFooter />
          </div>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
