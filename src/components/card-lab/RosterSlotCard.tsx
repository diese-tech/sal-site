import { AvatarMark, RolePill } from "@/components/card-lab/ui";
import type { RosterSlot } from "@/types/card-lab";
import { cn } from "@/lib/utils";

export function RosterSlotCard({ slot, compact = false }: { slot: RosterSlot; compact?: boolean }) {
  const player = slot.player ?? slot.projectedPlayer;

  return (
    <div
      className={cn(
        "relative flex min-h-16 items-center gap-3 rounded-xl border p-3 transition duration-300",
        slot.state === "drafted" && "border-white/10 bg-white/[0.055]",
        slot.state === "empty" && "border-dashed border-white/12 bg-white/[0.025]",
        slot.state === "queued-ghost" && "border-dashed border-cyan-200/25 bg-cyan-200/[0.045] opacity-70",
        slot.state === "active" && "border-orange-300/55 bg-orange-400/10 shadow-[0_0_22px_rgba(251,146,60,0.16)]",
      )}
    >
      <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/25 text-xs font-black text-slate-300">
        {slot.pickNumber ?? slot.slotNumber}
      </div>

      {player ? (
        <>
          <AvatarMark initials={player.avatarInitials} gradient={player.avatarGradient} className="size-10 rounded-xl text-xs" />
          <div className="min-w-0 flex-1">
            <p className={cn("truncate font-black text-white", compact ? "text-sm" : "text-base")}>{player.ign}</p>
            <div className="mt-1 flex items-center gap-1.5">
              <RolePill role={player.primaryRole} compact />
              {slot.state === "queued-ghost" ? <span className="text-[0.65rem] font-bold uppercase text-cyan-100/60">Projected</span> : null}
            </div>
          </div>
        </>
      ) : (
        <div className="min-w-0 flex-1">
          <p className="font-black text-slate-300">{slot.state === "active" ? "On the clock" : "Open roster slot"}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{slot.state === "active" ? "Captain selecting now" : "Awaiting pick"}</p>
        </div>
      )}
    </div>
  );
}
