import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
}

async function verifyAdminSessionEdge(value: string, secret: string): Promise<boolean> {
  const dotIndex = value.lastIndexOf(".");
  if (dotIndex === -1) return false;
  const encoded = value.slice(0, dotIndex);
  const signature = value.slice(dotIndex + 1);
  if (!encoded || !signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const expectedBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded));
  const expectedHex = Array.from(new Uint8Array(expectedBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expectedHex !== signature) return false;

  try {
    const payload = JSON.parse(decodeBase64Url(encoded)) as { discordId?: unknown; role?: unknown; exp?: unknown };
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return false;
    if (typeof payload.discordId !== "string") return false;
    return payload.role === "super_admin" || payload.role === "admin";
  } catch {
    return false;
  }
}

function isPublicAdminPath(pathname: string) {
  return (
    pathname === "/admin/login" ||
    pathname === "/api/admin/login" ||
    pathname.startsWith("/api/admin/discord/")
  );
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const protectsAdminPage = pathname.startsWith("/admin") && !isPublicAdminPath(pathname);
  const protectsAdminApi = pathname.startsWith("/api/admin") && !isPublicAdminPath(pathname);

  if (protectsAdminPage || protectsAdminApi) {
    const secret = process.env.ADMIN_SESSION_SECRET;
    const cookieValue = request.cookies.get("sal_admin_session")?.value;
    const verified = secret && cookieValue ? await verifyAdminSessionEdge(cookieValue, secret) : false;

    if (!verified) {
      if (protectsAdminApi) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  // Skip if Supabase Auth is not configured
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session if it has expired
  await supabase.auth.getUser();
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
