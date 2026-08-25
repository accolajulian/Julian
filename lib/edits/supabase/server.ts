import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Request-scoped Supabase client for the Edits app (Server Components,
// Route Handlers). Reads the user's session from cookies so every query
// runs as that user — RLS enforces access, not the query itself.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component render — proxy.ts already
            // refreshes the session cookie, so this is safe to ignore.
          }
        },
      },
    }
  );
}
