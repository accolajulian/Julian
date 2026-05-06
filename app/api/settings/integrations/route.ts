import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import { encrypt } from "@/lib/encryption";

// ─── Schema ───────────────────────────────────────────────────────────────────

const integrationsSchema = z.object({
  apollo_api_key: z.string().min(1).optional(),
  atlas_api_key: z.string().min(1).optional(),
  twilio_account_sid: z.string().min(1).optional(),
  twilio_auth_token: z.string().min(1).optional(),
  twilio_phone_number: z.string().min(1).optional(),
  target_industry: z.string().optional(),
  target_county: z.string().optional(),
  target_state: z.string().optional(),
  script_choice: z.enum(["default", "custom"]).optional(),
  custom_script: z.string().optional(),
});

// ─── PATCH /api/settings/integrations ────────────────────────────────────────
// Saves (encrypted) integration keys and onboarding config for the org.

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
      .eq("clerk_user_id", userId)
      .single() as { data: { organization_id: string } | null };

    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const orgId = userRecord.organization_id;

    // Upsert each provided key into api_keys (encrypted)
    // Cast inserts to `never` to work around the Supabase generated-types mismatch
    // in this codebase (the DB schema is not yet introspected).

    if (data.apollo_api_key) {
      await supabase.from("api_keys").upsert(
        {
          organization_id: orgId,
          name: "apollo_api_key",
          key_prefix: data.apollo_api_key.slice(0, 8),
          key_hash: encrypt(data.apollo_api_key),
          scopes: ["leads"],
          is_active: true,
          created_by: userId,
        } as never,
        { onConflict: "organization_id,name" }
      );
    }

    if (data.atlas_api_key) {
      await supabase.from("api_keys").upsert(
        {
          organization_id: orgId,
          name: "atlas_api_key",
          key_prefix: data.atlas_api_key.slice(0, 8),
          key_hash: encrypt(data.atlas_api_key),
          scopes: ["calls"],
          is_active: true,
          created_by: userId,
        } as never,
        { onConflict: "organization_id,name" }
      );
    }

    if (data.twilio_account_sid && data.twilio_auth_token) {
      await supabase.from("api_keys").upsert(
        {
          organization_id: orgId,
          name: "twilio_credentials",
          key_prefix: data.twilio_account_sid.slice(0, 8),
          key_hash: encrypt(
            JSON.stringify({
              account_sid: data.twilio_account_sid,
              auth_token: data.twilio_auth_token,
              phone_number: data.twilio_phone_number ?? "",
            })
          ),
          scopes: ["calling"],
          is_active: true,
          created_by: userId,
        } as never,
        { onConflict: "organization_id,name" }
      );
    }

    // Persist onboarding target/script data in org settings
    const settingsUpdates: Record<string, unknown> = {};
    if (data.target_industry) settingsUpdates.onboarding_industry = data.target_industry;
    if (data.target_county) settingsUpdates.onboarding_county = data.target_county;
    if (data.target_state) settingsUpdates.onboarding_state = data.target_state;
    if (data.script_choice) settingsUpdates.onboarding_script_choice = data.script_choice;
    if (data.custom_script) settingsUpdates.onboarding_custom_script = data.custom_script;

    if (Object.keys(settingsUpdates).length > 0) {
      const { data: currentOrg } = await supabase
        .from("organizations")
        .select("settings")
        .eq("id", orgId)
        .single() as { data: { settings: Record<string, unknown> } | null };

      await supabase
        .from("organizations")
        .update({
          settings: {
            ...(currentOrg?.settings ?? {}),
            ...settingsUpdates,
          },
        } as never)
        .eq("id", orgId);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PATCH /api/settings/integrations]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
