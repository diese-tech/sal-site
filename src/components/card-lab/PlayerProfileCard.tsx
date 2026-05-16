import { AvatarMark, GlowPanel, RolePill, StatusChip } from "@/components/card-lab/ui";
import type { PlayerProfile } from "@/types/card-lab";
import { cn } from "@/lib/utils";

export function PlayerProfileCard({ player, featured = false }: { player: PlayerProfile; featured?: boolean }) {
  return (
    <GlowPanel active={player.status === "active"} className={cn("min-h-full", featured && "lg:col-span-2")}>
      <div className={cn("h-28 bg-gradient-to-br", player.bannerGradient)}>
        <div className="h-full bg-[linear-gradient(135deg,rgba(255,255,255,0.22),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.28),transparent_18%)]" />
      </div>
      <div className="px-5 pb-5">
        <div className="-mt-9 flex items-end justify-between gap-4">
          <AvatarMark initials={player.avatarInitials} gradient={player.avatarGradient} className="size-20 text-xl" />
          <StatusChip status={player.status} label={player.orgName ?? undefined} />
        </div>

        <div className="mt-4">
          <h3 className="text-2xl font-black leading-tight text-white">{player.ign}</h3>
          <p className="mt-1 text-sm font-medium text-slate-400">@{player.discordUsername}</p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <RolePill role={player.primaryRole} />
          {player.secondaryRoles.map((role) => (
            <RolePill key={role} role={role} compact />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-sm text-slate-300">
          <span className="font-semibold text-slate-400">Timezone</span>
          <span className="font-bold text-white">{player.timezone}</span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {player.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-slate-300">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </GlowPanel>
  );
}
