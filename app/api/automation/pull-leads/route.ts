import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import { hasExceededLeadLimit } from "@/lib/stripe";
import type { PlanType } from "@/lib/types";
import Bull from "bull";

// ─── Queue ────────────────────────────────────────────────────────────────────

function getLeadPullQueue() {
  return new Bull("lead-pull", {
    redis: process.env.REDIS_URL ?? "redis://localhost:6379",
  });
}

// ─── POST /api/automation/pull-leads ─────────────────────────────────────────

const pullLeadsSchema = z.object({
  target_id: z.string().uuid().optional(),
  count: z.number().int().min(1).max(100).optional().default(25),
});

export async function POST(req: NextRequest) {
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
      .eq("clerk_id", userId)
      .single() as { data: { organization_id: string } | null };

    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const orgId = userRecord.organization_id;

    // Load org plan + usage
    const { data: org } = await supabase
      .from("organizations")
      .select("plan, leads_used_this_month")
      .eq("id", orgId)
      .single() as {
        data: { plan: PlanType; leads_used_this_month: number } | null;
      };

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Enforce lead limit
    if (hasExceededLeadLimit(org.plan, org.leads_used_this_month)) {
      return NextResponse.json(
        {
          error: "Lead limit reached",
          message: `You have used all your leads for this billing period on the ${org.plan} plan. Upgrade to pull more leads.`,
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = pullLeadsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Get targets to pull for
    let targetIds: string[] = [];
    if (parsed.data.target_id) {
      targetIds = [parsed.data.target_id];
    } else {
      const { data: targets } = await supabase
        .from("targets")
        .select("id")
        .eq("organization_id", orgId)
        .eq("is_active", true);
      targetIds = ((targets ?? []) as { id: string }[]).map((t) => t.id);
    }

    if (targetIds.length === 0) {
      return NextResponse.json(
        { error: "No active targets found. Create a target first." },
        { status: 400 }
      );
    }

    // Queue jobs
    const queue = getLeadPullQueue();
    const jobs = await Promise.all(
      targetIds.map((targetId) =>
        queue.add(
          {
            organizationId: orgId,
            targetId,
            count: parsed.data.count,
          },
          {
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: true,
          }
        )
      )
    );

    return NextResponse.json({
      queued: true,
      jobIds: jobs.map((j) => j.id),
      targetCount: targetIds.length,
    });
  } catch (err) {
    console.error("[POST /api/automation/pull-leads]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
