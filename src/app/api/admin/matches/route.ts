import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { isAdminRequest } from "@/lib/admin-auth";
import { getAllSeasons, saveMatch } from "@/lib/league-data";
import { errorMessage } from "@/lib/error-monitor";

const matchSchema = z.object({
  id: z.string().min(1),
  divisionId: z.enum(["solar", "lunar", "gaia"]),
  homeOrgId: z.string().min(1),
  awayOrgId: z.string().min(1),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "scheduledDate must be YYYY-MM-DD"),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/, "scheduledTime must be HH:MM"),
  status: z.enum(["scheduled", "live", "completed", "postponed", "forfeit"]),
  week: z.number().int().min(1),
  seasonId: z.string().min(1).optional(),
  homeScore: z.number().int().min(0).optional(),
  awayScore: z.number().int().min(0).optional(),
  streamUrl: z.string().url().optional().or(z.literal("")),
  vodUrl: z.string().url().optional().or(z.literal("")),
}).superRefine((val, ctx) => {
  if (val.homeOrgId === val.awayOrgId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "homeOrgId and awayOrgId must differ", path: ["awayOrgId"] });
  }
  if ((val.status === "completed" || val.status === "forfeit") && (val.homeScore === undefined || val.awayScore === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "homeScore and awayScore are required when status is completed", path: ["homeScore"] });
  }
  if (val.status !== "completed" && val.status !== "forfeit" && (val.homeScore !== undefined || val.awayScore !== undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "scores may only be set when status is completed", path: ["homeScore"] });
  }
  if (val.status === "scheduled") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const matchDate = new Date(val.scheduledDate);
    // Allow up to 1 day in the past to accommodate timezone edge cases
    const oneDayAgo = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    if (matchDate < oneDayAgo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scheduledDate cannot be more than 1 day in the past for scheduled matches",
        path: ["scheduledDate"],
      });
    }
  }
});

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  // Coerce numeric fields from JSON before validation
  const coerced = {
    ...body,
    week: body.week !== undefined ? Number(body.week) : body.week,
    homeScore: body.homeScore !== undefined && body.homeScore !== null ? Number(body.homeScore) : undefined,
    awayScore: body.awayScore !== undefined && body.awayScore !== null ? Number(body.awayScore) : undefined,
    streamUrl: body.streamUrl || undefined,
    vodUrl: body.vodUrl || undefined,
    seasonId: body.seasonId || undefined,
  };

  const result = matchSchema.safeParse(coerced);
  if (!result.success) {
    const message = result.error.issues.map((i) => i.message).join("; ");
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    // Matches without an explicit season belong to the active season —
    // standings only count season-scoped matches, so a NULL season would
    // silently exclude the match from the table.
    let match = result.data;
    if (!match.seasonId) {
      const seasons = await getAllSeasons();
      const active = seasons.find((s) => s.status === "active") ?? seasons[0];
      if (active) match = { ...match, seasonId: active.id };
    }
    await saveMatch(match);
    revalidateTag("league-data", {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = errorMessage(err, "Unknown error saving match.");
    console.error("POST /api/admin/matches error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
