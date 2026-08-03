import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAdminRequestSession } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const requestSchema = z.object({
  status: z.enum(["acknowledged", "investigating", "resolved"]),
}).strict();

const resultSchema = z.object({
  code: z.enum(["applied", "already_processed"]),
  bugReportId: z.string().uuid(),
  finalStatus: z.enum(["acknowledged", "investigating", "resolved"]),
  applied: z.boolean(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const session = getAdminRequestSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const idResult = z.string().uuid().safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid bug report id." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid bug report status." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const { data, error } = await supabase.rpc("update_bug_report_status", {
    p_bug_report_id: idResult.data,
    p_actor_discord_id: session.discordId,
    p_status: parsed.data.status,
  });
  if (error) {
    const status = error.code === "P0002" ? 404 : error.code === "55000" ? 409 : 500;
    return NextResponse.json({ error: "The bug report status could not be updated." }, { status });
  }

  const result = resultSchema.safeParse(data);
  if (!result.success) {
    return NextResponse.json({ error: "Database returned an invalid status result." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, status: result.data.finalStatus });
}
