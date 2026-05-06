import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import { google } from "googleapis";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrgId(clerkUserId: string): Promise<string | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("users")
    .select("organization_id")
    .eq("clerk_user_id", clerkUserId)
    .single() as { data: { organization_id: string } | null };
  return data?.organization_id ?? null;
}

async function createGoogleCalendarEvent(params: {
  title: string;
  description: string | null;
  scheduledAt: string;
  durationMinutes: number;
  timezone: string;
  meetLink?: boolean;
}): Promise<{ eventId: string; meetLink: string | null } | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });

    const calendar = google.calendar({ version: "v3", auth: oauth2 });

    const start = new Date(params.scheduledAt);
    const end = new Date(start.getTime() + params.durationMinutes * 60 * 1000);

    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: params.title,
        description: params.description ?? undefined,
        start: { dateTime: start.toISOString(), timeZone: params.timezone },
        end: { dateTime: end.toISOString(), timeZone: params.timezone },
        conferenceData: params.meetLink
          ? {
              createRequest: {
                requestId: `jacbuilds-${Date.now()}`,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            }
          : undefined,
      },
      conferenceDataVersion: params.meetLink ? 1 : 0,
    });

    const meetLink =
      event.data.conferenceData?.entryPoints?.find(
        (e) => e.entryPointType === "video"
      )?.uri ?? null;

    return { eventId: event.data.id ?? "", meetLink };
  } catch {
    return null;
  }
}

// ─── GET /api/bookings ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrgId(userId);
    if (!orgId) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, parseInt(searchParams.get("pageSize") ?? "25", 10));
    const offset = (page - 1) * pageSize;

    const supabase = createServerClient();
    let query = supabase
      .from("bookings")
      .select("*", { count: "exact" })
      .eq("organization_id", orgId)
      .order("scheduled_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (status) query = query.eq("status", status);
    if (from) query = query.gte("scheduled_at", from);
    if (to) query = query.lte("scheduled_at", to);

    const { data: bookings, error, count } = await query;
    if (error) throw error;

    const total = count ?? 0;
    return NextResponse.json({
      bookings: bookings ?? [],
      total,
      page,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    console.error("[GET /api/bookings]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── POST /api/bookings ───────────────────────────────────────────────────────

const createBookingSchema = z.object({
  lead_id: z.string().uuid(),
  call_id: z.string().uuid().nullable().optional(),
  target_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  scheduled_at: z.string().datetime(),
  duration_minutes: z.number().int().min(5).max(480).default(30),
  timezone: z.string().default("America/Chicago"),
  create_meet_link: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrgId(userId);
    if (!orgId) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = createBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const d = parsed.data;

    // Try Google Calendar
    const calResult = await createGoogleCalendarEvent({
      title: d.title,
      description: d.description ?? null,
      scheduledAt: d.scheduled_at,
      durationMinutes: d.duration_minutes,
      timezone: d.timezone,
      meetLink: d.create_meet_link,
    });

    const supabase = createServerClient();

    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({
        organization_id: orgId,
        lead_id: d.lead_id,
        call_id: d.call_id ?? null,
        target_id: d.target_id ?? null,
        calendar_event_id: calResult?.eventId ?? null,
        calendar_provider: calResult ? "google" : null,
        title: d.title,
        description: d.description ?? null,
        scheduled_at: d.scheduled_at,
        duration_minutes: d.duration_minutes,
        timezone: d.timezone,
        meet_link: calResult?.meetLink ?? null,
        status: "confirmed",
        cancelled_at: null,
        cancellation_reason: null,
      })
      .select()
      .single();

    if (error) throw error;

    // Update lead status to booked
    await supabase
      .from("leads")
      .update({ status: "booked" })
      .eq("id", d.lead_id)
      .eq("organization_id", orgId);

    return NextResponse.json(booking, { status: 201 });
  } catch (err) {
    console.error("[POST /api/bookings]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
