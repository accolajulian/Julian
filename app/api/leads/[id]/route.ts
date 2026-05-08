import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import type { LeadStatus } from "@/lib/types";

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

// ─── GET /api/leads/[id] ──────────────────────────────────────────────────────

export async function GET(
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

    const { data: lead, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .eq("organization_id", orgId)
      .single();

    if (error || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Fetch related calls
    const { data: calls } = await supabase
      .from("calls")
      .select("*")
      .eq("lead_id", id)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    // Fetch related booking (most recent)
    const { data: bookings } = await supabase
      .from("bookings")
      .select("*")
      .eq("lead_id", id)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1);

    return NextResponse.json({
      lead,
      calls: calls ?? [],
      booking: bookings?.[0] ?? null,
    });
  } catch (err) {
    console.error("[GET /api/leads/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── PATCH /api/leads/[id] ────────────────────────────────────────────────────

const updateLeadSchema = z.object({
  status: z
    .enum(["new", "queued", "calling", "called", "interested", "booked", "dead"])
    .optional(),
  notes: z.string().nullable().optional(),
  next_call_at: z.string().datetime().nullable().optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
  email: z.string().email().nullable().optional(),
  company: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
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
    const parsed = updateLeadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Confirm ownership
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("id", id)
      .eq("organization_id", orgId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    const d = parsed.data;
    if (d.status !== undefined) updateData.status = d.status as LeadStatus;
    if (d.notes !== undefined) updateData.notes = d.notes;
    if (d.next_call_at !== undefined) updateData.next_call_at = d.next_call_at;
    if (d.custom_fields !== undefined) updateData.custom_fields = d.custom_fields;
    if (d.email !== undefined) updateData.email = d.email;
    if (d.company !== undefined) updateData.company = d.company;
    if (d.title !== undefined) updateData.title = d.title;

    const { data: updated, error } = await supabase
      .from("leads")
      .update(updateData)
      .eq("id", id)
      .eq("organization_id", orgId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PATCH /api/leads/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── DELETE /api/leads/[id] ───────────────────────────────────────────────────

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
      .from("leads")
      .delete()
      .eq("id", id)
      .eq("organization_id", orgId);

    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[DELETE /api/leads/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
