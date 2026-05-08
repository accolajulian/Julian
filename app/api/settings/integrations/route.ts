import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";

// ─── Schema ───────────────────────────────────────────────────────────────────

const integrationsSchema = z.object({
  business_name: z.string().min(1).optional(),
  website_url: z.string().url().optional(),
  avg_job_value: z.number().int().min(0).optional(),
  target_industry: z.string().optional(),
  target_county: z.string().optional(),
  target_state: z.string().optional(),
  script_choice: z.enum(["ai", "custom"]).optional(),
  custom_script: z.string().optional(),
});

// ─── PATCH /api/settings/integrations ────────────────────────────────────────
// Saves onboarding business config for the org. API keys live in env vars only.

export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = integrationsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const supabase = createServerClient();

    // Resolve org
    const { data: userRecord } = await supabase
      .from("users")
      .select("organization_id")
      .eq("clerk_id", userId)
      .single() as { data: { organization_id: string } | null };

    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const orgId = userRecord.organization_id;

    // Load current org record
    const { data: currentOrg } = await supabase
      .from("organizations")
      .select("name, avg_job_value, settings")
      .eq("id", orgId)
      .single() as {
        data: {
          name: string;
          avg_job_value: number;
          settings: Record<string, unknown>;
        } | null;
      };

    // Build top-level column updates
    const orgUpdates: Record<string, unknown> = {};
    if (data.business_name) orgUpdates.name = data.business_name;
    if (data.avg_job_value !== undefined) orgUpdates.avg_job_value = data.avg_job_value;

    // Build settings JSONB updates
    const settingsUpdates: Record<string, unknown> = {};
    if (data.website_url) settingsUpdates.website_url = data.website_url;
    if (data.target_industry) settingsUpdates.onboarding_industry = data.target_industry;
    if (data.target_county) settingsUpdates.onboarding_county = data.target_county;
    if (data.target_state) settingsUpdates.onboarding_state = data.target_state;
    if (data.script_choice) settingsUpdates.onboarding_script_choice = data.script_choice;
    if (data.custom_script) settingsUpdates.onboarding_custom_script = data.custom_script;

    if (Object.keys(settingsUpdates).length > 0) {
      orgUpdates.settings = {
        ...(currentOrg?.settings ?? {}),
        ...settingsUpdates,
      };
    }

    if (Object.keys(orgUpdates).length > 0) {
      await supabase
        .from("organizations")
        .update(orgUpdates as never)
        .eq("id", orgId);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PATCH /api/settings/integrations]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
