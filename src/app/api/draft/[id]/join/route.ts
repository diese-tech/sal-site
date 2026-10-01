import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  exchangeToken,
  getCaptainSeatsFromRequest,
  grantCaptainSeat,
  revokeCaptainSeat,
} from "@/lib/captain-auth";
import { normalizeAccessCode } from "@/lib/draft-access-code";
import { checkRateLimit, clearRateLimit, getRateLimitIdentifier, retryAfterSeconds } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/league-data";
import { reportError } from "@/lib/error-monitor";

const joinSchema = z.object({ code: z.string().min(1).max(200) }).strict();

/**
 * Audit without blocking the join. `writeAuditLog` rethrows on a database
 * error, and joining is the one draft-day path that must not fail for a
 * reason unrelated to the captain's code.
 */
async function auditJoin(action: string, draftRoomId: string, payload: Record<string, unknown>) {
  try {
    await writeAuditLog(action, "draft_room", draftRoomId, payload);
  } catch (error) {
    reportError("draft join audit failed", error, { draftRoomId, action });
  }
}

/** Redeem a team access code and take that team's seat in this draft room. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = joinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your team code." }, { status: 400 });
  }

  // Short codes are guessable in a way that 32-character link tokens were not,
  // so redemption is throttled. The shared limiter allows 10 attempts per 15
  // minutes — ample for typos, useless for searching a 1.1e12 keyspace.
  const rateKey = `draft-join:${id}:${getRateLimitIdentifier(request)}`;
  const limit = checkRateLimit(rateKey);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a few minutes and try again, or ask an admin to read your code back to you." },
      { status: 429, headers: { "Retry-After": retryAfterSeconds(limit.resetAt) } },
    );
  }

  const session = await exchangeToken(parsed.data.code);
  if (!session || session.draftRoomId !== id) {
    // Failed attempts are audited so a brute-force run is visible even though
    // the rate limiter itself is per-instance.
    await auditJoin("draft_join_failed", id, {
      draftRoomId: id,
      reason: session ? "code_belongs_to_another_room" : "unknown_or_expired_code",
      attemptedLength: normalizeAccessCode(parsed.data.code).length,
    });
    return NextResponse.json(
      { error: "That code is not valid for this draft. Check it with an admin — codes look like ABCD-2345." },
      { status: 401 },
    );
  }

  // A captain who mistyped a few times should not stay throttled once they
  // get it right.
  clearRateLimit(rateKey);

  await auditJoin("draft_seat_joined", id, {
    draftRoomId: id,
    orgId: session.orgId,
  });

  const response = NextResponse.json({ ok: true, orgId: session.orgId });
  grantCaptainSeat(response, getCaptainSeatsFromRequest(request), session);
  return response;
}

/**
 * Release this browser's seat in the room — the escape hatch when a captain
 * joins on a shared machine, or the wrong team's code was entered. Seats held
 * in other rooms are preserved.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = NextResponse.json({ ok: true });
  revokeCaptainSeat(response, getCaptainSeatsFromRequest(request), id);
  return response;
}
