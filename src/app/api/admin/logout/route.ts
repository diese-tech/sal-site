import { NextResponse } from "next/server";
import { expiredAdminCookie } from "@/lib/admin-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const cookie = expiredAdminCookie();
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
