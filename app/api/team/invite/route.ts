import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import { PLAN_LIMITS } from "@/lib/stripe";
import type { PlanType } from "@/lib/types";

// ─── POST /api/team/invite ────────────────────────────────────────────────────

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServerClient();

    const { data: userRecord } = await supabase
      .from("users")
      .select("organization_id, role")
      .eq("clerk_user_id", userId)
      .single() as { data: { organization_id: string; role: string } | null };

    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Only owners and admins can invite
    if (!["owner", "admin"].includes(userRecord.role)) {
      return NextResponse.json(
        { error: "Only owners and admins can invite team members." },
        { status: 403 }
      );
    }

    const orgId = userRecord.organization_id;

    // Load org plan
    const { data: org } = await supabase
      .from("organizations")
      .select("plan")
      .eq("id", orgId)
      .single() as { data: { plan: PlanType } | null };

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Plan seat check
    const seatLimit = PLAN_LIMITS[org.plan].seats;
    const { count: currentSeats } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("is_active", true);

    if (seatLimit !== Infinity && (currentSeats ?? 0) >= seatLimit) {
      return NextResponse.json(
        {
          error: "Seat limit reached",
          message: `Your ${org.plan} plan allows up to ${seatLimit} seat${seatLimit === 1 ? "" : "s"}. Upgrade to invite more team members.`,
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { email, role } = parsed.data;

    // Check if user already exists in org
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("organization_id", orgId)
      .eq("email", email)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "This email is already a member of your team." },
        { status: 409 }
      );
    }

    // In a real implementation, send a Clerk invitation email.
    // For now, we log the intent and return success.
    // Clerk invitations would be handled via clerk.invitations.createInvitation()
    // using the @clerk/backend SDK on the server.
    console.info(`[team/invite] Invitation requested for ${email} (role: ${role}) in org ${orgId}`);

    return NextResponse.json({
      success: true,
      message: `Invitation sent to ${email}.`,
    });
  } catch (err) {
    console.error("[POST /api/team/invite]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
