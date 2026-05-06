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
    .eq("clerk_user_id", clerkUserId)
    .single() as { data: { organization_id: string } | null };
  return data?.organization_id ?? null;
}

// ─── GET /api/leads ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrgId(userId);
    if (!orgId) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") as LeadStatus | null;
    const industry = searchParams.get("industry");
    const search = searchParams.get("search");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, parseInt(searchParams.get("pageSize") ?? "25", 10));
    const offset = (page - 1) * pageSize;

    const supabase = createServerClient();
    let query = supabase
      .from("leads")
      .select("*", { count: "exact" })
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (status) query = query.eq("status", status);
    if (industry) query = query.eq("custom_fields->>industry", industry);
    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,company.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
      );
    }

    const { data: leads, error, count } = await query;
    if (error) throw error;

    const total = count ?? 0;
    return NextResponse.json({
      leads: leads ?? [],
      total,
      page,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    console.error("[GET /api/leads]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── POST /api/leads ──────────────────────────────────────────────────────────

const createLeadSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().min(7),
  email: z.string().email().nullable().optional(),
  company: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  linkedin_url: z.string().url().nullable().optional(),
  website: z.string().url().nullable().optional(),
  target_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional().default({}),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrgId(userId);
    if (!orgId) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = createLeadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const supabase = createServerClient();

    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        organization_id: orgId,
        first_name: data.first_name,
        last_name: data.last_name,
        full_name: `${data.first_name} ${data.last_name}`,
        phone: data.phone,
        email: data.email ?? null,
        company: data.company ?? null,
        title: data.title ?? null,
        linkedin_url: data.linkedin_url ?? null,
        website: data.website ?? null,
        target_id: data.target_id ?? null,
        notes: data.notes ?? null,
        custom_fields: data.custom_fields,
        status: "new" as LeadStatus,
        last_called_at: null,
        next_call_at: null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(lead, { status: 201 });
  } catch (err) {
    console.error("[POST /api/leads]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
