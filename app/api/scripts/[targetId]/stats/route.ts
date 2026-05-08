import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export interface ScriptVariantStats {
  variant: "a" | "b";
  calls: number;
  interested: number;
  booked: number;
  interest_rate: number;
  booking_rate: number;
  avg_duration_seconds: number;
}

// GET /api/scripts/[targetId]/stats — A/B performance breakdown
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ targetId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { targetId } = await params;
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

    // Fetch completed calls for this target with variant tracking
    const { data: calls } = await supabase
      .from("calls")
      .select("script_variant, outcome, duration_seconds")
      .eq("organization_id", orgId)
      .eq("target_id", targetId)
      .eq("status", "completed")
      .not("script_variant", "is", null) as {
        data: Array<{
          script_variant: "a" | "b" | null;
          outcome: string | null;
          duration_seconds: number | null;
        }> | null;
      };

    const rows = calls ?? [];

    function buildStats(variant: "a" | "b"): ScriptVariantStats {
      const variantCalls = rows.filter((c) => c.script_variant === variant);
      const total = variantCalls.length;
      const interested = variantCalls.filter(
        (c) => c.outcome === "interested" || c.outcome === "booked"
      ).length;
      const booked = variantCalls.filter((c) => c.outcome === "booked").length;
      const totalDuration = variantCalls.reduce(
        (sum, c) => sum + (c.duration_seconds ?? 0),
        0
      );

      return {
        variant,
        calls: total,
        interested,
        booked,
        interest_rate: total > 0 ? Math.round((interested / total) * 100) : 0,
        booking_rate: total > 0 ? Math.round((booked / total) * 100) : 0,
        avg_duration_seconds: total > 0 ? Math.round(totalDuration / total) : 0,
      };
    }

    return NextResponse.json({
      a: buildStats("a"),
      b: buildStats("b"),
    });
  } catch (err) {
    console.error("[GET /api/scripts/[targetId]/stats]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
