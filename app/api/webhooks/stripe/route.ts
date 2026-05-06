// Handles all Stripe lifecycle events to keep subscription state in sync
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createServerClient } from "@/lib/supabase";
import { sendWelcomeEmail, sendPaymentFailedEmail, sendCancellationEmail } from "@/lib/resend";
import type { PlanType } from "@/lib/types";

// Raw body required for webhook signature verification
export const dynamic = "force-dynamic";

function getPlanFromPriceId(priceId: string): PlanType {
  if (priceId === process.env.STRIPE_STARTER_PRICE_ID) return "starter";
  if (priceId === process.env.STRIPE_GROWTH_PRICE_ID) return "growth";
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  // Default to starter if unknown
  return "starter";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set.");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stripe-webhook] Signature verification failed:", message);
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  const supabase = createServerClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;

        if (session.mode === "payment") {
          // One-time setup fee payment
          const { error } = await supabase
            .from("organizations")
            .update({ stripe_setup_fee_paid: true } as never)
            .eq("stripe_customer_id", customerId);

          if (error) {
            console.error("[stripe-webhook] Failed to mark setup fee paid:", error);
          }
        } else if (session.mode === "subscription") {
          const subscriptionId = session.subscription as string;

          // Fetch the full subscription to get plan details
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = subscription.items.data[0]?.price.id ?? "";
          const plan = getPlanFromPriceId(priceId);

          const { data: org, error } = await supabase
            .from("organizations")
            .update({
              stripe_subscription_id: subscriptionId,
              plan,
              subscription_status: "active",
            } as never)
            .eq("stripe_customer_id", customerId)
            .select("id, name, settings")
            .single();

          if (error) {
            console.error("[stripe-webhook] Failed to update org subscription:", error);
          } else if (org) {
            // Find the owner user to send welcome email
            const { data: user } = await supabase
              .from("users")
              .select("email, full_name")
              .eq("organization_id", (org as { id: string }).id)
              .eq("role", "owner")
              .single();

            if (user) {
              await sendWelcomeEmail(
                (user as { email: string; full_name: string }).email,
                (user as { email: string; full_name: string }).full_name,
                (org as { name: string }).name
              );
            }
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const priceId = subscription.items.data[0]?.price.id ?? "";
        const plan = getPlanFromPriceId(priceId);
        const status = subscription.status === "active" ? "active"
          : subscription.status === "past_due" ? "past_due"
          : subscription.status === "canceled" ? "cancelled"
          : subscription.status;

        const { error } = await supabase
          .from("organizations")
          .update({ plan, subscription_status: status } as never)
          .eq("stripe_customer_id", customerId);

        if (error) {
          console.error("[stripe-webhook] Failed to update subscription:", error);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const { data: org, error } = await supabase
          .from("organizations")
          .update({ subscription_status: "cancelled" } as never)
          .eq("stripe_customer_id", customerId)
          .select("id, name, settings")
          .single();

        if (error) {
          console.error("[stripe-webhook] Failed to mark subscription cancelled:", error);
        } else if (org) {
          const orgRecord = org as { id: string; name: string; settings: { notification_email: string | null } };

          // Stop all Bull jobs for this org by importing queue instances
          // We do a dynamic import to avoid circular deps at module load time
          try {
            const { leadPullingQueue, callTriggeringQueue, calendarBookingQueue } = await import("@/workers/index");
            const jobs = await Promise.all([
              leadPullingQueue.getJobs(["waiting", "active", "delayed"]),
              callTriggeringQueue.getJobs(["waiting", "active", "delayed"]),
              calendarBookingQueue.getJobs(["waiting", "active", "delayed"]),
            ]);

            const allJobs = jobs.flat();
            const orgJobs = allJobs.filter((j) => j.data?.organizationId === orgRecord.id);

            await Promise.allSettled(orgJobs.map((j) => j.remove()));
            console.log(`[stripe-webhook] Removed ${orgJobs.length} queued jobs for cancelled org ${orgRecord.id}`);
          } catch (queueError) {
            console.error("[stripe-webhook] Failed to remove Bull jobs:", queueError);
          }

          // Send cancellation email
          const { data: user } = await supabase
            .from("users")
            .select("email, full_name")
            .eq("organization_id", orgRecord.id)
            .eq("role", "owner")
            .single();

          if (user) {
            await sendCancellationEmail(
              (user as { email: string; full_name: string }).email,
              (user as { email: string; full_name: string }).full_name
            );
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const { data: org, error } = await supabase
          .from("organizations")
          .update({ subscription_status: "past_due" } as never)
          .eq("stripe_customer_id", customerId)
          .select("id")
          .single();

        if (error) {
          console.error("[stripe-webhook] Failed to mark org past_due:", error);
        } else if (org) {
          const { data: user } = await supabase
            .from("users")
            .select("email, full_name")
            .eq("organization_id", (org as { id: string }).id)
            .eq("role", "owner")
            .single();

          if (user) {
            await sendPaymentFailedEmail(
              (user as { email: string; full_name: string }).email,
              (user as { email: string; full_name: string }).full_name
            );
          }
        }
        break;
      }

      default:
        // Unhandled event type — acknowledge receipt
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }
  } catch (handlerError) {
    console.error(`[stripe-webhook] Error handling event ${event.type}:`, handlerError);
    return NextResponse.json({ error: "Internal handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
