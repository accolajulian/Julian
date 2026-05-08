import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { stripe } from "@/lib/stripe";

// ─── GET /api/billing/portal ──────────────────────────────────────────────────

export async function GET() {
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

    const { data: org } = await supabase
      .from("organizations")
      .select("stripe_customer_id")
      .eq("id", userRecord.organization_id)
      .single() as { data: { stripe_customer_id: string | null } | null };

    if (!org?.stripe_customer_id) {
      return NextResponse.json(
        { error: "No Stripe customer found. Complete checkout first." },
        { status: 400 }
      );
    }

    const returnUrl =
      process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=billing`
        : "http://localhost:3000/settings?tab=billing";

    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[GET /api/billing/portal]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
