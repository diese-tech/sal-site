import { NextResponse } from "next/server";
import { adminCookie, verifyAdminPassword } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { password?: string } | null;
  if (!body?.password || !verifyAdminPassword(body.password)) {
    return NextResponse.json({ error: "Invalid admin password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  const cookie = adminCookie();
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
