import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { isSuperAdminRequest } from "@/lib/admin-auth";
import { errorMessage } from "@/lib/error-monitor";
import { getPreseasonIngestPreview, ingestSeasonFromPreseason } from "@/lib/preseason-ingest";

// Preview must run before any write so an admin can verify org/captain
// relationships before committing (#230 acceptance: preview before any write).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSuperAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized. Superadmin required." }, { status: 403 });
  }
  const { id: targetSeasonId } = await params;
  const source = request.nextUrl.searchParams.get("source");
  if (!source) return NextResponse.json({ error: "Missing source season id." }, { status: 400 });

  try {
    const preview = await getPreseasonIngestPreview(source, targetSeasonId);
    return NextResponse.json(preview);
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err, "Unable to build ingest preview.") }, { status: 500 });
  }
}

const applySchema = z.object({ source: z.string().min(1) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSuperAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized. Superadmin required." }, { status: 403 });
  }
  const { id: targetSeasonId } = await params;
  const parsed = applySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing or invalid source season id." }, { status: 400 });
  }

  try {
    const result = await ingestSeasonFromPreseason(parsed.data.source, targetSeasonId);
    revalidateTag("league-data", {});
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err, "Unable to ingest preseason participation.") }, { status: 500 });
  }
}
