"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client for the Edits app. Uses Supabase Auth
// (separate from LeadEmm's Clerk auth) so requests carry the signed-in
// user's session and RLS policies apply automatically.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
