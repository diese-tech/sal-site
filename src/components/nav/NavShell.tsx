"use client";

import { usePathname } from "next/navigation";
import { SiteNav } from "./SiteNav";

export function NavShell({ children, ticker }: { children: React.ReactNode; ticker: React.ReactNode }) {
  const pathname = usePathname();
  const hideChrome = pathname.startsWith("/admin") || pathname.startsWith("/lab");

  return (
    <>
      {!hideChrome && ticker}
      {!hideChrome && <SiteNav />}
      {/* pt-24 = ticker (32px) + nav (64px) */}
      <div className={!hideChrome ? "pt-24" : undefined}>{children}</div>
    </>
  );
}
