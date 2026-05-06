import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerClient } from "@/lib/supabase";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-04-22.dahlia",
  });
}

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const clerkConfigured =
  (clerkKey.startsWith("pk_test_") || clerkKey.startsWith("pk_live_")) &&
  !clerkKey.includes("REPLACE_ME");

// Maps our plan names to Stripe price IDs from env
function getPriceId(plan: string): string {
  const map: Record<string, string> = {
    starter: process.env.STRIPE_STARTER_PRICE_ID!,
    growth: process.env.STRIPE_GROWTH_PRICE_ID!,
    pro: process.env.STRIPE_PRO_PRICE_ID!,
  };
  const id = map[plan];
  if (!id) throw new Error(`Unknown plan: ${plan}`);
  return id;
}

/**
 * POST /api/checkout
 * Creates a Stripe Checkout Session with:
 *   1. $400 one-time setup fee line item
 *   2. Monthly subscription for the chosen plan
 * The two items are in a single checkout so both charge at once.
 */
export async function POST(req: NextRequest) {
  let userId: string | null = null;
  if (clerkConfigured) {
    const { auth } = await import("@clerk/nextjs/server");
    const session = await auth();
    userId = session.userId ?? null;
  }
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const plan = (body.plan as string)?.toLowerCase();
  if (!["starter", "growth", "pro"].includes(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Look up or create Stripe customer linked to this Clerk user
  const { data: user } = await supabase
    .from("users")
    .select("email, name, organization_id, organizations(stripe_customer_id)")
    .eq("clerk_id", userId)
    .single();

  let customerId: string | undefined;

  if (user?.organizations) {
    const org = user.organizations as { stripe_customer_id?: string };
    customerId = org.stripe_customer_id ?? undefined;
  }

  if (!customerId) {
    const customer = await getStripe().customers.create({
      email: user?.email ?? undefined,
      name: user?.name ?? undefined,
      metadata: { clerk_id: userId, organization_id: user?.organization_id ?? "" },
    });
    customerId = customer.id;

    // Persist the new Stripe customer ID
    if (user?.organization_id) {
      await supabase
        .from("organizations")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.organization_id);
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [
      // One-time $400 setup fee, added as a subscription add-on invoice item
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "One-Time Setup Fee",
            description: "Account setup, integrations config, and first-month onboarding.",
          },
          unit_amount: 40000, // $400.00 in cents
          recurring: undefined,
        },
        quantity: 1,
      },
      // Recurring subscription
      {
        price: getPriceId(plan),
        quantity: 1,
      },
    ],
    payment_method_types: ["card"],
    subscription_data: {
      metadata: {
        plan,
        clerk_id: userId,
        organization_id: user?.organization_id ?? "",
      },
    },
    metadata: {
      plan,
      clerk_id: userId,
      organization_id: user?.organization_id ?? "",
      setup_fee: "true",
    },
    success_url: `${appUrl}/onboarding?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/pricing`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
