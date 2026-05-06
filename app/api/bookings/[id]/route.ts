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

async function deleteGoogleCalendarEvent(eventId: string): Promise<void> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return;

  try {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });
    const calendar = google.calendar({ version: "v3", auth: oauth2 });
    await calendar.events.delete({ calendarId: "primary", eventId });
  } catch {
    // Non-fatal — event may already be deleted
  }
}

// ─── GET /api/bookings/[id] ───────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrgId(userId);
    if (!orgId) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const { id } = await params;
    const supabase = createServerClient();

    const { data: booking, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .eq("organization_id", orgId)
      .single();

    if (error || !booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    return NextResponse.json(booking);
  } catch (err) {
    console.error("[GET /api/bookings/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── PATCH /api/bookings/[id] ─────────────────────────────────────────────────

const updateBookingSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  scheduled_at: z.string().datetime().optional(),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  timezone: z.string().optional(),
  status: z
    .enum(["confirmed", "cancelled", "rescheduled", "completed", "no_show"])
    .optional(),
  cancellation_reason: z.string().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrgId(userId);
    if (!orgId) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = updateBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Confirm ownership
    const { data: existing } = await supabase
      .from("bookings")
      .select("id")
      .eq("id", id)
      .eq("organization_id", orgId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const d = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (d.title !== undefined) updateData.title = d.title;
    if (d.description !== undefined) updateData.description = d.description;
    if (d.scheduled_at !== undefined) updateData.scheduled_at = d.scheduled_at;
    if (d.duration_minutes !== undefined) updateData.duration_minutes = d.duration_minutes;
    if (d.timezone !== undefined) updateData.timezone = d.timezone;
    if (d.status !== undefined) {
      updateData.status = d.status;
      if (d.status === "cancelled") {
        updateData.cancelled_at = new Date().toISOString();
        if (d.cancellation_reason !== undefined) {
          updateData.cancellation_reason = d.cancellation_reason;
        }
      }
    }

    const { data: updated, error } = await supabase
      .from("bookings")
      .update(updateData)
      .eq("id", id)
      .eq("organization_id", orgId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PATCH /api/bookings/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── DELETE /api/bookings/[id] ────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrgId(userId);
    if (!orgId) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const { id } = await params;
    const supabase = createServerClient();

    // Get calendar event id before deleting
    const { data: booking } = await supabase
      .from("bookings")
      .select("calendar_event_id, calendar_provider")
      .eq("id", id)
      .eq("organization_id", orgId)
      .single();

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // Cancel Google Calendar event
    if (booking.calendar_event_id && booking.calendar_provider === "google") {
      await deleteGoogleCalendarEvent(booking.calendar_event_id);
    }

    const { error } = await supabase
      .from("bookings")
      .delete()
      .eq("id", id)
      .eq("organization_id", orgId);

    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[DELETE /api/bookings/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
