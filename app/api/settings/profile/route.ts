import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";

// ─── PATCH /api/settings/profile ─────────────────────────────────────────────

const profileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  owner_name: z.string().min(1).max(100).optional(),
  notification_email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  average_job_value: z.number().min(0).nullable().optional(),
  settings: z
    .object({
      timezone: z.string().optional(),
      calling_hours_start: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
      calling_hours_end: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
      calling_days: z.array(z.number().int().min(0).max(6)).optional(),
      max_call_attempts: z.number().int().min(1).max(10).optional(),
      retry_delay_hours: z.number().min(0.5).max(72).optional(),
      voicemail_enabled: z.boolean().optional(),
      sms_notifications: z.boolean().optional(),
      notification_email: z.string().email().nullable().optional(),
    })
    .optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServerClient();

    // Resolve org
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
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const updateData: Record<string, unknown> = {};

    if (d.name !== undefined) updateData.name = d.name;

    // Merge settings patch into existing JSONB column
    if (d.settings !== undefined) {
      // Fetch current settings first
      const { data: currentOrg } = await supabase
        .from("organizations")
        .select("settings")
        .eq("id", orgId)
        .single() as { data: { settings: Record<string, unknown> } | null };

      const merged = {
        ...(currentOrg?.settings ?? {}),
        ...d.settings,
      };
      updateData.settings = merged;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data: updated, error } = await supabase
      .from("organizations")
      .update(updateData)
      .eq("id", orgId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PATCH /api/settings/profile]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
