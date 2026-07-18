"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Season } from "@/types/league";
import { cn } from "@/lib/utils";

interface Props {
  seasons: Season[];
  currentSeasonId: string;
}

export function SeasonSelector({ seasons, currentSeasonId }: Props) {
  const pathname = usePathname();

  if (seasons.length <= 1) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {seasons.map((season) => {
        const isActive = season.id === currentSeasonId;
        const href = isActive ? pathname : `${pathname}?season=${encodeURIComponent(season.id)}`;
        return (
          <Link
            key={season.id}
            href={href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-black uppercase transition",
              isActive
                ? "bg-emerald-400/25 text-emerald-100 border border-emerald-300/50"
                : "bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10",
            )}
          >
            {season.name}
          </Link>
        );
      })}
    </div>
  );
}
