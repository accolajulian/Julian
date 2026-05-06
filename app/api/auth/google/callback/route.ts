import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createServerClient } from "@/lib/supabase";
import { encrypt } from "@/lib/encryption";

// ─── GET /api/auth/google/callback ───────────────────────────────────────────
// Receives the OAuth authorization code from Google, exchanges it for tokens,
// and stores the encrypted refresh_token in the api_keys table.

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.redirect(`${appUrl}/login`);
    }

    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const errorParam = searchParams.get("error");

    // Handle user-denied authorization
    if (errorParam) {
      console.warn("[google/callback] User denied access:", errorParam);
      return NextResponse.redirect(`${appUrl}/onboarding?step=3&connected=false&error=access_denied`);
    }

    if (!code) {
      return NextResponse.redirect(`${appUrl}/onboarding?step=3&connected=false&error=no_code`);
    }

    // CSRF check: verify state matches the cookie
    const cookieState = req.cookies.get("google_oauth_state")?.value;
    if (!state || !cookieState || state !== cookieState) {
      console.error("[google/callback] State mismatch — possible CSRF attack");
      return NextResponse.redirect(`${appUrl}/onboarding?step=3&connected=false&error=state_mismatch`);
    }

    // Validate state payload contains the same userId
    let statePayload: { userId: string; ts: number };
    try {
      statePayload = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
    } catch {
      return NextResponse.redirect(`${appUrl}/onboarding?step=3&connected=false&error=invalid_state`);
    }

    if (statePayload.userId !== userId) {
      console.error("[google/callback] userId mismatch in state");
      return NextResponse.redirect(`${appUrl}/onboarding?step=3&connected=false&error=user_mismatch`);
    }

    // Exchange code for tokens
    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = `${appUrl}/api/auth/google/callback`;

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      // This happens if the user already authorized once and prompt=consent wasn't set.
      // Should not occur since we always pass prompt: 'consent', but handle gracefully.
      console.warn("[google/callback] No refresh_token in response");
      return NextResponse.redirect(`${appUrl}/onboarding?step=3&connected=false&error=no_refresh_token`);
    }

    // Resolve org from user record
    const supabase = createServerClient();
    const { data: userRecord } = await supabase
      .from("users")
      .select("organization_id")
      .eq("clerk_user_id", userId)
      .single() as { data: { organization_id: string } | null };

    if (!userRecord?.organization_id) {
      console.error("[google/callback] No org found for user:", userId);
      return NextResponse.redirect(`${appUrl}/onboarding?step=3&connected=false&error=no_org`);
    }

    const orgId = userRecord.organization_id;

    // Encrypt and upsert the refresh token into api_keys
    const encryptedToken = encrypt(tokens.refresh_token);

    await supabase
      .from("api_keys")
      .upsert(
        {
          organization_id: orgId,
          name: "google_refresh_token",
          key_prefix: "goog_cal",
          key_hash: encryptedToken,
          scopes: ["calendar"],
          is_active: true,
          created_by: userId,
          last_used_at: new Date().toISOString(),
        } as never,
        {
          onConflict: "organization_id,name",
        }
      );

    // Update org settings to reflect Google Calendar is connected
    await supabase
      .from("organizations")
      .update({
        settings: {
          calendar_provider: "google",
        },
      } as never)
      .eq("id", orgId);

    // Clear CSRF cookie and redirect to onboarding step 3 with success
    const response = NextResponse.redirect(`${appUrl}/onboarding?step=3&connected=true`);
    response.cookies.set("google_oauth_state", "", { maxAge: 0, path: "/" });

    return response;
  } catch (err) {
    console.error("[GET /api/auth/google/callback]", err);
    return NextResponse.redirect(`${appUrl}/onboarding?step=3&connected=false&error=server_error`);
  }
}
