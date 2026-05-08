import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrgId(clerkUserId: string): Promise<string | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("users")
    .select("organization_id")
    .eq("clerk_id", clerkUserId)
    .single() as { data: { organization_id: string } | null };
  return data?.organization_id ?? null;
}

// ─── PATCH /api/targets/[id] ──────────────────────────────────────────────────

const updateTargetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  niche: z.string().nullable().optional(),
  script_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
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
    const parsed = updateTargetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Confirm ownership
    const { data: existing } = await supabase
      .from("targets")
      .select("id")
      .eq("id", id)
      .eq("organization_id", orgId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Target not found" }, { status: 404 });
    }

    const d = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (d.name !== undefined) updateData.name = d.name;
    if (d.description !== undefined) updateData.description = d.description;
    if (d.industry !== undefined) updateData.industry = d.industry;
    if (d.niche !== undefined) updateData.niche = d.niche;
    if (d.script_id !== undefined) updateData.script_id = d.script_id;
    if (d.is_active !== undefined) updateData.is_active = d.is_active;

    const { data: updated, error } = await supabase
      .from("targets")
      .update(updateData)
      .eq("id", id)
      .eq("organization_id", orgId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PATCH /api/targets/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── DELETE /api/targets/[id] ─────────────────────────────────────────────────

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

    const { error } = await supabase
      .from("targets")
      .delete()
      .eq("id", id)
      .eq("organization_id", orgId);

    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[DELETE /api/targets/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
