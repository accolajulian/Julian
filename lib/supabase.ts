import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

// ─── Environment variable helpers ────────────────────────────────────────────

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Check your .env.local file.`);
  }
  return value;
}

// ─── Browser (client-side) Supabase client ───────────────────────────────────
// Using untyped client to avoid Supabase generic inference conflicts with our
// custom Database interfaces. All table shapes are typed at the call site.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let browserClient: SupabaseClient<any> | null = null;

export function createClient() {
  if (browserClient) return browserClient;
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  browserClient = createSupabaseClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return browserClient;
}

// ─── Server-side Supabase admin client ───────────────────────────────────────
// Used in API routes and Server Components. Bypasses Row Level Security.

export function createServerClient() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const supabase = createClient;
export const supabaseAdmin = createServerClient;
