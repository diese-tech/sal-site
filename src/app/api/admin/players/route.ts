import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { getAdminRequestSession } from "@/lib/admin-auth";
import { CaptainReassignmentConfirmationError, savePlayerForCurrentSeason } from "@/lib/league-data";
import { errorMessage } from "@/lib/error-monitor";

const playerSchema = z.object({
  id: z.string().min(1),
  ign: z.string().min(1).max(64),
  discordUsername: z.string().min(1).max(64),
  primaryRole: z.enum(["Solo", "Jungle", "Mid", "Carry", "Support", "Flex"]),
  secondaryRoles: z.array(z.enum(["Solo", "Jungle", "Mid", "Carry", "Support", "Flex"])).optional(),
  status: z.enum(["free-agent", "org-affiliated", "drafted", "queued-ghost", "active"]),
  orgId: z.string().min(1).optional(),
  divisionId: z.enum(["solar", "lunar", "terra"]).optional(),
  avatarInitials: z.string().max(4).optional().default(""),
  avatarGradient: z.string().optional().default(""),
  isStarter: z.boolean().optional().default(false),
  isCaptain: z.boolean().optional().default(false),
  stats: z.unknown().optional(),
  confirmCaptainReassignment: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const session = getAdminRequestSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized. Admin required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const result = playerSchema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues.map((i) => i.message).join("; ");
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const { confirmCaptainReassignment, ...player } = result.data;
    await savePlayerForCurrentSeason(player as Parameters<typeof savePlayerForCurrentSeason>[0], {
      confirmCaptainReassignment,
      actorDiscordId: session.discordId,
    });
    revalidateTag("league-data", {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof CaptainReassignmentConfirmationError) {
      return NextResponse.json({ error: err.message, confirmationRequired: true }, { status: 409 });
    }
    const message = errorMessage(err, "Unknown error saving player.");
    console.error("POST /api/admin/players error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
