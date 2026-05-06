import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import { PLAN_LIMITS } from "@/lib/stripe";
import type { PlanType } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrgRecord(clerkUserId: string) {
  const supabase = createServerClient();
  const { data: userRecord } = await supabase
    .from("users")
    .select("organization_id")
    .eq("clerk_user_id", clerkUserId)
    .single() as { data: { organization_id: string } | null };

  if (!userRecord?.organization_id) return null;

  const { data: org } = await supabase
    .from("organizations")
    .select("id, plan")
    .eq("id", userRecord.organization_id)
    .single() as { data: { id: string; plan: PlanType } | null };

  return org;
}

// ─── GET /api/targets ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getOrgRecord(userId);
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("active") === "true";

    const supabase = createServerClient();
    let query = supabase
      .from("targets")
      .select("*")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false });

    if (activeOnly) query = query.eq("is_active", true);

    const { data: targets, error } = await query;
    if (error) throw error;

    return NextResponse.json({ targets: targets ?? [] });
  } catch (err) {
    console.error("[GET /api/targets]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── POST /api/targets ────────────────────────────────────────────────────────

const createTargetSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  niche: z.string().nullable().optional(),
  script_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getOrgRecord(userId);
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Plan limit check
    const supabase = createServerClient();
    const { count: existingCount } = await supabase
      .from("targets")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("is_active", true);

    const limit = PLAN_LIMITS[org.plan].targets;
    if (limit !== Infinity && (existingCount ?? 0) >= limit) {
      return NextResponse.json(
        {
          error: "Plan limit reached",
          message: `Your ${org.plan} plan allows up to ${limit} active target${limit === 1 ? "" : "s"}. Upgrade to add more.`,
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = createTargetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const { data: target, error } = await supabase
      .from("targets")
      .insert({
        organization_id: org.id,
        name: d.name,
        description: d.description ?? null,
        industry: d.industry ?? null,
        niche: d.niche ?? null,
        script_id: d.script_id ?? null,
        is_active: d.is_active,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(target, { status: 201 });
  } catch (err) {
    console.error("[POST /api/targets]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
