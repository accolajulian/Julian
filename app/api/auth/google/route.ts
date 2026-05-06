import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { google } from "googleapis";

// ─── GET /api/auth/google ─────────────────────────────────────────────────────
// Builds the Google OAuth URL and redirects the user to authorize access.
// Scopes: calendar.events, calendar.readonly (unified as 'calendar')

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const redirectUri = `${appUrl}/api/auth/google/callback`;

    if (!clientId || !clientSecret) {
      console.error("[GET /api/auth/google] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
      return NextResponse.json(
        { error: "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
        { status: 500 }
      );
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    // CSRF state: encode userId so callback can verify it
    const state = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString("base64url");

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/calendar"],
      state,
    });

    // Store state in a short-lived cookie for CSRF verification in the callback
    const response = NextResponse.redirect(authUrl);
    response.cookies.set("google_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10, // 10 minutes
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("[GET /api/auth/google]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
