import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";

// ─── PATCH /api/settings/notifications ───────────────────────────────────────

const notificationsSchema = z.object({
  email_on_booking: z.boolean().optional(),
  sms_on_booking: z.boolean().optional(),
  daily_summary_enabled: z.boolean().optional(),
  daily_summary_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  weekly_report_enabled: z.boolean().optional(),
  payment_reminders: z.boolean().optional(),
  notification_email: z.string().email().nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServerClient();

    const { data: userRecord } = await supabase
      .from("users")
      .select("organization_id")
      .eq("clerk_user_id", userId)
      .single() as { data: { organization_id: string } | null };

    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const orgId = userRecord.organization_id;

    const body = await req.json();
    const parsed = notificationsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const d = parsed.data;

    // Fetch current settings to merge
    const { data: currentOrg } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", orgId)
      .single() as { data: { settings: Record<string, unknown> } | null };

    const currentSettings = currentOrg?.settings ?? {};

    const notifPatch: Record<string, unknown> = {};
    if (d.email_on_booking !== undefined) notifPatch.email_on_booking = d.email_on_booking;
    if (d.sms_on_booking !== undefined) notifPatch.sms_notifications = d.sms_on_booking;
    if (d.daily_summary_enabled !== undefined)
      notifPatch.daily_summary_enabled = d.daily_summary_enabled;
    if (d.daily_summary_time !== undefined) notifPatch.daily_summary_time = d.daily_summary_time;
    if (d.weekly_report_enabled !== undefined)
      notifPatch.weekly_report_enabled = d.weekly_report_enabled;
    if (d.payment_reminders !== undefined) notifPatch.payment_reminders = d.payment_reminders;
    if (d.notification_email !== undefined) notifPatch.notification_email = d.notification_email;

    const merged = { ...currentSettings, ...notifPatch };

    const { data: updated, error } = await supabase
      .from("organizations")
      .update({ settings: merged })
      .eq("id", orgId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PATCH /api/settings/notifications]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
