import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// ─── POST /api/settings/test-integration ─────────────────────────────────────

const testSchema = z.discriminatedUnion("service", [
  z.object({
    service: z.literal("apollo"),
    apiKey: z.string().min(1),
  }),
  z.object({
    service: z.literal("atlas"),
    apiKey: z.string().min(1),
  }),
  z.object({
    service: z.literal("twilio"),
    accountSid: z.string().min(1),
    authToken: z.string().min(1),
    phoneNumber: z.string().min(1),
  }),
  z.object({
    service: z.literal("resend"),
    apiKey: z.string().min(1),
  }),
  z.object({
    service: z.literal("google_calendar"),
  }),
]);

async function testApollo(apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("https://api.apollo.io/v1/auth/health", {
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
    });
    if (res.ok) return { ok: true, message: "Apollo.io connected successfully." };
    return { ok: false, message: `Apollo returned status ${res.status}. Check your API key.` };
  } catch {
    return { ok: false, message: "Could not reach Apollo.io. Check your network or API key." };
  }
}

async function testResend(apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) return { ok: true, message: "Resend connected successfully." };
    return { ok: false, message: `Resend returned status ${res.status}. Check your API key.` };
  } catch {
    return { ok: false, message: "Could not reach Resend. Check your network or API key." };
  }
}

async function testTwilio(
  accountSid: string,
  authToken: string,
  phoneNumber: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      { headers: { Authorization: `Basic ${credentials}` } }
    );
    if (res.ok) {
      return { ok: true, message: `Twilio connected. Phone number ${phoneNumber} ready.` };
    }
    return { ok: false, message: `Twilio returned status ${res.status}. Check your credentials.` };
  } catch {
    return { ok: false, message: "Could not reach Twilio. Check your credentials." };
  }
}

async function testAtlas(apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    const baseUrl = process.env.ATLAS_API_URL ?? "https://api.atlas.ai";
    const res = await fetch(`${baseUrl}/v1/health`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) return { ok: true, message: "Atlas AI connected successfully." };
    return { ok: false, message: `Atlas returned status ${res.status}. Check your API key.` };
  } catch {
    return { ok: false, message: "Could not reach Atlas AI. Check your API key." };
  }
}

// ─── GET /api/settings/test-integration ──────────────────────────────────────
// Supports query-param form: ?service=apollo&key=...
// Used by the onboarding wizard for quick connection tests.

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const service = searchParams.get("service");
    const key = searchParams.get("key");

    if (!service) {
      return NextResponse.json({ error: "Missing 'service' query param" }, { status: 400 });
    }

    let result: { ok: boolean; message: string };

    switch (service) {
      case "apollo":
        if (!key) return NextResponse.json({ error: "Missing 'key'" }, { status: 400 });
        result = await testApollo(key);
        break;
      case "atlas":
        if (!key) return NextResponse.json({ error: "Missing 'key'" }, { status: 400 });
        result = await testAtlas(key);
        break;
      default:
        return NextResponse.json({ error: `Unsupported service: ${service}` }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET /api/settings/test-integration]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = testSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    let result: { ok: boolean; message: string };

    switch (data.service) {
      case "apollo":
        result = await testApollo(data.apiKey);
        break;
      case "atlas":
        result = await testAtlas(data.apiKey);
        break;
      case "twilio":
        result = await testTwilio(data.accountSid, data.authToken, data.phoneNumber);
        break;
      case "resend":
        result = await testResend(data.apiKey);
        break;
      case "google_calendar":
        // OAuth — can only verify token existence
        result = {
          ok: !!process.env.GOOGLE_REFRESH_TOKEN,
          message: process.env.GOOGLE_REFRESH_TOKEN
            ? "Google Calendar is connected."
            : "Google Calendar is not connected. Use the Connect button to authorize.",
        };
        break;
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/settings/test-integration]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
