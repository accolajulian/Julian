import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";

const scriptUpdateSchema = z.object({
  script_a: z.string().min(1).optional(),
  script_b: z.string().optional().nullable(),
});

// PUT /api/scripts/[targetId] — update variant A and/or B scripts
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ targetId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { targetId } = await params;
    const body = await req.json();
    const parsed = scriptUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation error", details: parsed.error.flatten() }, { status: 400 });
    }

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

    // Verify target belongs to this org
    const { data: target } = await supabase
      .from("targets")
      .select("id, settings")
      .eq("id", targetId)
      .eq("organization_id", orgId)
      .single() as { data: { id: string; settings: Record<string, unknown> | null } | null };

    if (!target) {
      return NextResponse.json({ error: "Target not found" }, { status: 404 });
    }

    // Check plan for variant B
    if (parsed.data.script_b !== undefined) {
      const { data: org } = await supabase
        .from("organizations")
        .select("plan")
        .eq("id", orgId)
        .single() as { data: { plan: string } | null };

      if (org?.plan !== "pro") {
        return NextResponse.json({ error: "A/B script testing requires the Pro plan" }, { status: 403 });
      }
    }

    const updates: Record<string, unknown> = {};

    if (parsed.data.script_a !== undefined) {
      updates.call_script = parsed.data.script_a;
    }

    if (parsed.data.script_b !== undefined) {
      updates.settings = {
        ...(target.settings ?? {}),
        script_b: parsed.data.script_b ?? null,
      };
    }

    if (Object.keys(updates).length > 0) {
      await supabase
        .from("targets")
        .update(updates as never)
        .eq("id", targetId);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PUT /api/scripts/[targetId]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
