"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle, XCircle, AlertTriangle, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import Navbar from "@/components/shared/Navbar";
import Footer from "@/components/shared/Footer";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Plan {
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  desc: string;
  features: string[];
  popular: boolean;
}

// ─── Plans data ───────────────────────────────────────────────────────────────
const PLANS: Plan[] = [
  {
    name: "Starter",
    monthlyPrice: 197,
    annualPrice: 247,
    desc: "For solo operators getting started with AI-powered lead generation.",
    features: [
      "50 leads per month",
      "AI voice calls via Atlas",
      "Google Calendar auto-booking",
      "Basic dashboard",
      "Email notifications",
      "1 user seat",
      "1 industry/location target",
    ],
    popular: false,
  },
  {
    name: "Growth",
    monthlyPrice: 397,
    annualPrice: 414,
    desc: "For growing teams who want more volume, customization, and reporting.",
    features: [
      "150 leads per month",
      "Everything in Starter",
      "SMS notifications",
      "Weekly performance reports",
      "Custom call scripts per industry",
      "Priority Atlas calling queue",
      "3 user seats",
      "3 industry/location targets",
    ],
    popular: true,
  },
  {
    name: "Pro",
    monthlyPrice: 597,
    annualPrice: 664,
    desc: "For established businesses who need unlimited power and dedicated support.",
    features: [
      "Unlimited leads per month",
      "Everything in Growth",
      "Dedicated support",
      "Custom branding",
      "API access",
      "Unlimited seats",
      "Unlimited targets",
      "Monthly strategy call",
    ],
    popular: false,
  },
];

// ─── Comparison table rows ────────────────────────────────────────────────────
const COMPARISON_FEATURES = [
  { label: "Leads per month", starter: "50", growth: "150", pro: "Unlimited" },
  { label: "AI voice calls (Atlas)", starter: true, growth: true, pro: true },
  { label: "Google Calendar booking", starter: true, growth: true, pro: true },
  { label: "Dashboard access", starter: "Basic", growth: "Full", pro: "Full" },
  { label: "Email notifications", starter: true, growth: true, pro: true },
  { label: "SMS notifications", starter: false, growth: true, pro: true },
  { label: "Weekly reports", starter: false, growth: true, pro: true },
  { label: "Custom call scripts", starter: false, growth: true, pro: true },
  { label: "Priority calling queue", starter: false, growth: true, pro: true },
  { label: "User seats", starter: "1", growth: "3", pro: "Unlimited" },
  { label: "Industry/location targets", starter: "1", growth: "3", pro: "Unlimited" },
  { label: "Dedicated support", starter: false, growth: false, pro: true },
  { label: "Custom branding", starter: false, growth: false, pro: true },
  { label: "API access", starter: false, growth: false, pro: true },
  { label: "Monthly strategy call", starter: false, growth: false, pro: true },
];

// ─── FAQ data ─────────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: "Is the 14-day free trial really one-time?",
    a: "Yes — the 14-day free trial is a one-time charge that covers account setup, integrations configuration, and your first-month onboarding. It is applied at checkout and is non-refundable.",
  },
  {
    q: "Can I upgrade or downgrade my plan?",
    a: "Absolutely. You can upgrade anytime and the new pricing takes effect immediately (prorated). Downgrades take effect at the start of your next billing cycle.",
  },
  {
    q: "What does the annual discount save me?",
    a: "Annual billing saves you 2 months — equivalent to about 17% off compared to paying month-to-month. Annual plans are billed as a single upfront payment.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit and debit cards (Visa, Mastercard, Amex, Discover) via Stripe. All payments are processed securely.",
  },
  {
    q: "What happens when I cancel?",
    a: "You can cancel anytime from your account settings. Your plan stays active until the end of your current billing period. No additional charges. The setup fee is non-refundable.",
  },
];

// ─── Helper: cell renderer ────────────────────────────────────────────────────
function Cell({ value }: { value: boolean | string }) {
  if (typeof value === "boolean") {
    return value ? (
      <CheckCircle className="w-5 h-5 text-[#00ff88] mx-auto" />
    ) : (
      <XCircle className="w-5 h-5 text-[#2a2d3e] mx-auto" />
    );
  }
  return <span className="text-sm text-white font-semibold">{value}</span>;
}

// ─── FAQ Item ─────────────────────────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[#2a2d3e] rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-[#1a1d2e] transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-semibold text-white text-sm sm:text-base">{q}</span>
        {open ? (
          <ChevronUp className="w-5 h-5 text-[#00ff88] shrink-0 ml-4" />
        ) : (
          <ChevronDown className="w-5 h-5 text-[#6b7280] shrink-0 ml-4" />
        )}
      </button>
      {open && (
        <div className="px-6 pb-4">
          <p className="text-sm text-[#6b7280] leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <div className="min-h-screen bg-[#0f1117] text-white">
      <Navbar />

      <main className="pt-28 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-black mb-4">
              Simple, transparent pricing
            </h1>
            <p className="text-[#6b7280] text-lg mb-8">
              14-day free trial + monthly subscription. No contracts. Cancel anytime.
            </p>

            {/* Billing toggle */}
            <div className="inline-flex items-center gap-4 bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl p-1.5">
              <button
                onClick={() => setAnnual(false)}
                className={cn(
                  "px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200",
                  !annual
                    ? "bg-[#0f1117] text-white shadow-sm"
                    : "text-[#6b7280] hover:text-white"
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setAnnual(true)}
                className={cn(
                  "px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2",
                  annual
                    ? "bg-[#0f1117] text-white shadow-sm"
                    : "text-[#6b7280] hover:text-white"
                )}
              >
                Annual
                <span className="text-[10px] font-black bg-[#00ff88] text-[#0f1117] px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                  Save 17%
                </span>
              </button>
            </div>
          </div>

          {/* ── Plan cards ─────────────────────────────────────────────────── */}
          <div className="grid md:grid-cols-3 gap-6 mb-10">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  "relative bg-[#1a1d2e] border rounded-2xl p-7 flex flex-col",
                  plan.popular
                    ? "border-[#00ff88]/50 shadow-[0_0_40px_rgba(0,255,136,0.08)]"
                    : "border-[#2a2d3e]"
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-[#00ff88] text-[#0f1117] text-xs font-black px-4 py-1 rounded-full uppercase tracking-wide">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-5">
                  <h2 className="text-xl font-bold mb-1">{plan.name}</h2>
                  <div className="flex items-end gap-1.5 mb-2">
                    <span className="text-4xl font-black text-[#00ff88]">
                      ${annual ? plan.annualPrice : plan.monthlyPrice}
                    </span>
                    <span className="text-[#6b7280] text-sm mb-1">/mo</span>
                  </div>
                  {annual && (
                    <p className="text-xs text-[#6b7280]">
                      Billed annually — ${plan.annualPrice * 12}/yr
                    </p>
                  )}
                  <p className="text-sm text-[#6b7280] mt-2 leading-relaxed">{plan.desc}</p>
                </div>

                <ul className="space-y-2.5 flex-1 mb-7">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-[#6b7280]">
                      <CheckCircle className="w-4 h-4 text-[#00ff88] shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/signup"
                  className={cn(
                    "text-sm font-bold py-3 rounded-xl text-center transition-colors block",
                    plan.popular
                      ? "bg-[#00ff88] text-[#0f1117] hover:bg-[#00ff88]/90"
                      : "border border-[#2a2d3e] text-white hover:border-[#00ff88]/30 hover:text-[#00ff88]"
                  )}
                >
                  Get Started
                </Link>
              </div>
            ))}
          </div>

          {/* ── Setup fee callout ───────────────────────────────────────────── */}
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-6 py-4 flex items-start gap-4 mb-16">
            <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-yellow-300 text-sm mb-1">
                One-time free trial Setup Fee
              </p>
              <p className="text-sm text-yellow-200/70 leading-relaxed">
                Applied at checkout. Covers account setup, integrations configuration, and first month
                onboarding. Non-refundable.
              </p>
            </div>
          </div>

          {/* ── Comparison table ────────────────────────────────────────────── */}
          <div className="mb-20">
            <h2 className="text-2xl font-black text-center mb-8">Compare All Features</h2>
            <div className="overflow-x-auto rounded-2xl border border-[#2a2d3e]">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#1a1d2e]">
                    <th className="text-left px-5 py-4 text-sm font-semibold text-[#6b7280] w-1/2">
                      Feature
                    </th>
                    {PLANS.map((p) => (
                      <th key={p.name} className="px-5 py-4 text-center w-1/6">
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className={cn(
                              "text-sm font-bold",
                              p.popular ? "text-[#00ff88]" : "text-white"
                            )}
                          >
                            {p.name}
                          </span>
                          <span className="text-xs text-[#6b7280]">
                            ${annual ? p.annualPrice : p.monthlyPrice}/mo
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_FEATURES.map((row, i) => (
                    <tr
                      key={row.label}
                      className={cn(
                        "border-t border-[#2a2d3e]",
                        i % 2 === 0 ? "bg-[#0f1117]" : "bg-[#1a1d2e]/40"
                      )}
                    >
                      <td className="px-5 py-3.5 text-sm text-[#6b7280]">{row.label}</td>
                      <td className="px-5 py-3.5 text-center">
                        <Cell value={row.starter} />
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <Cell value={row.growth} />
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <Cell value={row.pro} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── FAQ ─────────────────────────────────────────────────────────── */}
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-black text-center mb-8">Pricing FAQ</h2>
            <div className="space-y-3 mb-14">
              {FAQ_ITEMS.map((item) => (
                <FaqItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>

            {/* Bottom CTA */}
            <div className="text-center">
              <p className="text-[#6b7280] mb-4">Ready to put your sales on autopilot?</p>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 bg-[#00ff88] text-[#0f1117] font-bold px-8 py-3.5 rounded-xl hover:bg-[#00ff88]/90 transition-colors"
              >
                Start Your Free Trial <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
