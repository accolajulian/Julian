import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { stripe } from "@/lib/stripe";

// ─── POST /api/billing/cancel ─────────────────────────────────────────────────

export async function POST() {
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

    if (userRecord.role !== "owner") {
      return NextResponse.json(
        { error: "Only the account owner can cancel the subscription." },
        { status: 403 }
      );
    }

    const { data: org } = await supabase
      .from("organizations")
      .select("stripe_subscription_id")
      .eq("id", userRecord.organization_id)
      .single() as { data: { stripe_subscription_id: string | null } | null };

    if (!org?.stripe_subscription_id) {
      return NextResponse.json(
        { error: "No active subscription found." },
        { status: 400 }
      );
    }

    // Cancel at period end (not immediately) to preserve access until end of billing cycle
    const subscription = await stripe.subscriptions.update(org.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    return NextResponse.json({
      success: true,
      cancel_at: subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000).toISOString()
        : null,
      message:
        "Your subscription will be cancelled at the end of the current billing period. You'll retain access until then.",
    });
  } catch (err) {
    console.error("[POST /api/billing/cancel]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
