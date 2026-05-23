import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

async function verifyAdminSessionEdge(value: string, secret: string): Promise<boolean> {
  const dotIndex = value.lastIndexOf(".");
  if (dotIndex === -1) return false;
  const encoded = value.slice(0, dotIndex);
  const signature = value.slice(dotIndex + 1);

  // Import key
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  // Recompute expected signature
  const expectedBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded));
  const expectedHex = Array.from(new Uint8Array(expectedBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expectedHex !== signature) return false;

  // Verify payload
  try {
    const payload = JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  // Protect /admin/* routes (except /admin/login itself)
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD;
    const cookieValue = request.cookies.get("sal_admin_session")?.value;
    if (!secret || !cookieValue || !(await verifyAdminSessionEdge(cookieValue, secret))) {
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
