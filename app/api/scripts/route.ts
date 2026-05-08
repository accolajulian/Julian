import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

// GET /api/scripts — returns all targets with their script data for the org
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServerClient();

    const { data: userRecord } = await supabase
      .from("users")
      .select("organization_id")
      .eq("clerk_id", userId)
      .single() as { data: { organization_id: string } | null };

    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const orgId = userRecord.organization_id;

    const { data: org } = await supabase
      .from("organizations")
      .select("plan")
      .eq("id", orgId)
      .single() as { data: { plan: string } | null };

    const { data: targets } = await supabase
      .from("targets")
      .select("id, industry, location_county, location_state, active, call_script, settings")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true });

    return NextResponse.json({
      plan: org?.plan ?? "starter",
      targets: (targets ?? []).map((t) => {
        const rec = t as {
          id: string;
          industry: string | null;
          location_county: string | null;
          location_state: string | null;
          active: boolean;
          call_script: string | null;
          settings: Record<string, unknown> | null;
        };
        return {
          id: rec.id,
          industry: rec.industry,
          location_county: rec.location_county,
          location_state: rec.location_state,
          active: rec.active,
          script_a: rec.call_script,
          script_b: (rec.settings?.script_b as string | null) ?? null,
        };
      }),
    });
  } catch (err) {
    console.error("[GET /api/scripts]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
