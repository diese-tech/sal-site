import { AvatarMark, GlowPanel, OrgLogo, RolePill, StatusChip } from "@/components/card-lab/ui";
import { RosterSlotCard } from "@/components/card-lab/RosterSlotCard";
import type { OrgRoster } from "@/types/card-lab";
import { cn } from "@/lib/utils";

export function OrgRosterCard({ org }: { org: OrgRoster }) {
  return (
    <GlowPanel active={org.state === "active"} className="h-full">
      <div className={cn("bg-gradient-to-br p-4", org.headerGradient)}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <OrgLogo initials={org.logoInitials} gradient={org.headerGradient} className="size-12" />
            <div className="min-w-0">
              <h3 className="truncate text-xl font-black text-white">{org.name}</h3>
              <p className="text-xs font-bold uppercase text-white/65">Draft position {org.draftPosition}</p>
            </div>
          </div>
          {org.state === "active" ? <StatusChip status="active" /> : <span className="rounded-full border border-white/15 bg-black/20 px-2.5 py-1 text-[0.68rem] font-bold uppercase text-white/60">Waiting</span>}
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="mb-2 text-[0.68rem] font-black uppercase tracking-normal text-slate-500">Captain locked</div>
          <div className="flex items-center gap-3">
            <AvatarMark initials={org.captain.avatarInitials} gradient={org.captain.avatarGradient} className="size-11 rounded-xl text-xs" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-black text-white">{org.captain.ign}</p>
              <p className="truncate text-xs font-medium text-slate-400">@{org.captain.discordUsername}</p>
            </div>
            <RolePill role={org.captain.primaryRole} compact />
          </div>
        </div>

        <div className="grid gap-2">
          {org.slots.map((slot) => (
            <RosterSlotCard key={`${org.id}-${slot.slotNumber}`} slot={slot} compact />
          ))}
        </div>
      </div>
    </GlowPanel>
  );
}
