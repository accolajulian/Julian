import Stripe from "stripe";
import type { PlanType } from "./types";

// ─── Stripe client (server-side only) ────────────────────────────────────────

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
    _stripe = new Stripe(key, { apiVersion: "2026-04-22.dahlia", typescript: true });
  }
  return _stripe;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// ─── Price ID helpers ─────────────────────────────────────────────────────────

/**
 * Returns the Stripe Price ID for the one-time setup fee.
 */
export function getSetupFeePriceId(): string {
  const id = process.env.STRIPE_SETUP_FEE_PRICE_ID;
  if (!id) throw new Error("STRIPE_SETUP_FEE_PRICE_ID is not set.");
  return id;
}

/**
 * Returns the Stripe Price ID for the Starter plan subscription.
 */
export function getStarterPriceId(): string {
  const id = process.env.STRIPE_STARTER_PRICE_ID;
  if (!id) throw new Error("STRIPE_STARTER_PRICE_ID is not set.");
  return id;
}

/**
 * Returns the Stripe Price ID for the Growth plan subscription.
 */
export function getGrowthPriceId(): string {
  const id = process.env.STRIPE_GROWTH_PRICE_ID;
  if (!id) throw new Error("STRIPE_GROWTH_PRICE_ID is not set.");
  return id;
}

/**
 * Returns the Stripe Price ID for the Pro plan subscription.
 */
export function getProPriceId(): string {
  const id = process.env.STRIPE_PRO_PRICE_ID;
  if (!id) throw new Error("STRIPE_PRO_PRICE_ID is not set.");
  return id;
}

/**
 * Returns the correct Price ID for a given plan type.
 */
export function getPriceIdForPlan(plan: PlanType): string {
  switch (plan) {
    case "starter":
      return getStarterPriceId();
    case "growth":
      return getGrowthPriceId();
    case "pro":
      return getProPriceId();
    default:
      throw new Error(`Unknown plan type: ${plan}`);
  }
}

// ─── Plan limits ──────────────────────────────────────────────────────────────

export interface PlanLimits {
  /** Maximum leads that can be called per billing month. */
  leads: number;
  /** Maximum number of active Target audiences. */
  targets: number;
  /** Maximum team seats (users). */
  seats: number;
  /** Human-readable label for display. */
  label: string;
  /** Monthly price in USD cents. */
  priceUsdCents: number;
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  starter: {
    leads: 50,
    targets: 1,
    seats: 1,
    label: "Starter",
    priceUsdCents: 19700,   // $397/month — update to match your Stripe prices
  },
  growth: {
    leads: 150,
    targets: 3,
    seats: 3,
    label: "Growth",
    priceUsdCents: 39700,   // $997/month
  },
  pro: {
    leads: Infinity,
    targets: Infinity,
    seats: Infinity,
    label: "Pro",
    priceUsdCents: 59700,  // $1,997/month
  },
};

// ─── Utility helpers ──────────────────────────────────────────────────────────

/**
 * Check whether an organisation has exceeded their monthly lead limit.
 */
export function hasExceededLeadLimit(
  plan: PlanType,
  leadsUsedThisMonth: number
): boolean {
  const limit = PLAN_LIMITS[plan].leads;
  if (limit === Infinity) return false;
  return leadsUsedThisMonth >= limit;
}

/**
 * Returns the percentage of the monthly lead quota consumed (0–100).
 * Returns 0 for unlimited plans.
 */
export function leadUsagePercent(
  plan: PlanType,
  leadsUsedThisMonth: number
): number {
  const limit = PLAN_LIMITS[plan].leads;
  if (limit === Infinity) return 0;
  return Math.min(100, Math.round((leadsUsedThisMonth / limit) * 100));
}

/**
 * Constructs the line items array for a new subscription checkout, including
 * the optional one-time setup fee.
 */
type CheckoutLineItem = { price?: string; quantity?: number; price_data?: unknown };

export function buildCheckoutLineItems(
  plan: PlanType,
  includeSetupFee = true
): CheckoutLineItem[] {
  const items: CheckoutLineItem[] = [
    { price: getPriceIdForPlan(plan), quantity: 1 },
  ];

  if (includeSetupFee) {
    items.unshift({ price: getSetupFeePriceId(), quantity: 1 });
  }

  return items;
}
