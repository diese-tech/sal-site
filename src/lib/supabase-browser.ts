import { createBrowserClient } from "@supabase/ssr";

function requirePublicSupabaseEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV !== "test") {
    throw new Error(`${name} must be set to initialize the browser Supabase client.`);
  }
  return value ?? "";
}

export function getSupabaseBrowserClient() {
  return createBrowserClient(
    requirePublicSupabaseEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requirePublicSupabaseEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}
