import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) throw new Error("Supabase is not configured.");

    const { error } = await supabase.from("seasons").select("id").limit(1);
    if (error) throw error;

    return NextResponse.json({ status: "ok", db: "ok", timestamp });
  } catch {
    return NextResponse.json({ status: "error", db: "unreachable", timestamp }, { status: 503 });
  }
}
