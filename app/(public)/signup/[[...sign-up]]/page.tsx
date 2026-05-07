"use client";

import { useState, useEffect } from "react";
import { SignUp } from "@clerk/nextjs";
import { Zap, Check } from "lucide-react";

// ─── Plan data ────────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "$197",
    period: "/mo",
    description: "For solo operators getting started.",
    features: ["50 leads/month", "AI voice calls", "Google Calendar booking", "1 user seat"],
  },
  {
    id: "growth",
    name: "Growth",
    price: "$397",
    period: "/mo",
    description: "For growing teams ready to scale.",
    popular: true,
    features: [
      "150 leads/month",
      "Everything in Starter",
      "Custom call scripts",
      "3 user seats",
      "SMS notifications",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$597",
    period: "/mo",
    description: "Unlimited power for established businesses.",
    features: [
      "Unlimited leads",
      "Everything in Growth",
      "Unlimited seats",
      "Dedicated support",
      "Monthly strategy call",
    ],
  },
] as const;

type PlanId = (typeof PLANS)[number]["id"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// ─── Plan Selector ────────────────────────────────────────────────────────────

function PlanSelector({
  selected,
  onSelect,
}: {
  selected: PlanId;
  onSelect: (id: PlanId) => void;
}) {
  return (
    <div className="w-full max-w-sm mb-6">
      <h2 className="text-sm font-semibold text-white mb-3">Choose Your Plan</h2>
      <div className="space-y-3">
        {PLANS.map((plan) => (
          <button
            key={plan.id}
            type="button"
            onClick={() => onSelect(plan.id)}
            className={cn(
              "relative w-full text-left rounded-xl border p-4 transition-all duration-200",
              selected === plan.id
                ? "border-[#00ff88] bg-[#00ff88]/5 shadow-[0_0_0_1px_rgba(0,255,136,0.2)]"
                : "border-[#2a2d3e] bg-[#1a1d2e] hover:border-[#2a2d3e]/80"
            )}
          >
            {"popular" in plan && plan.popular && (
              <span className="absolute -top-2.5 left-4 bg-[#00ff88] text-[#0f1117] text-xs font-black px-3 py-0.5 rounded-full">
                Most Popular
              </span>
            )}

            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="font-bold text-white text-sm">{plan.name}</p>
                <p className="text-xs text-[#6b7280] mt-0.5">{plan.description}</p>
                <ul className="mt-2 space-y-1">
                  {plan.features.slice(0, 3).map((f) => (
                    <li key={f} className="flex items-center gap-1.5 text-xs text-[#6b7280]">
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          selected === plan.id ? "bg-[#00ff88]" : "bg-[#2a2d3e]"
                        )}
                      />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-black text-[#00ff88]">{plan.price}</p>
                <p className="text-xs text-[#6b7280]">{plan.period}</p>
              </div>
            </div>

            {/* Selection indicator */}
            {selected === plan.id && (
              <div className="absolute top-3 right-3">
                <span className="w-5 h-5 rounded-full bg-[#00ff88] flex items-center justify-center">
                  <Check className="w-3 h-3 text-[#0f1117]" />
                </span>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Disclaimer */}
      <div className="mt-3 bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-4 py-2.5">
        <p className="text-xs text-[#6b7280] text-center">
          <span className="text-[#f59e0b] font-semibold">Note:</span> 14-day free trial
          required to activate your account.
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SignupPage() {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("growth");

  // Persist plan choice to sessionStorage so post-signup webhook can read it
  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("selected_plan", selectedPlan);
    }
  }, [selectedPlan]);

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center px-4 py-12">
      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#00ff88]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative flex flex-col items-center w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#00ff88]/10 border border-[#00ff88]/20 flex items-center justify-center mb-4">
            <Zap className="w-7 h-7 text-[#00ff88]" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">LeadEmm</h1>
          <p className="text-sm text-[#6b7280] mt-1.5 text-center">
            Start filling your calendar automatically.
          </p>
        </div>

        {/* Plan selector — shown above Clerk component */}
        <PlanSelector selected={selectedPlan} onSelect={setSelectedPlan} />

        {/* Clerk SignUp */}
        <SignUp
          appearance={{
            variables: {
              colorBackground: "#1a1d2e",
              colorInputBackground: "#0f1117",
              colorInputText: "#ffffff",
              colorText: "#ffffff",
              colorTextSecondary: "#6b7280",
              colorPrimary: "#00ff88",
              colorDanger: "#ef4444",
              borderRadius: "0.75rem",
              fontFamily: "inherit",
            },
            elements: {
              card: {
                backgroundColor: "#1a1d2e",
                border: "1px solid #2a2d3e",
                boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
                borderRadius: "1rem",
              },
              headerTitle: { color: "#ffffff", fontWeight: "800" },
              headerSubtitle: { color: "#6b7280" },
              formButtonPrimary: {
                backgroundColor: "#00ff88",
                color: "#0f1117",
                fontWeight: "700",
                "&:hover": { backgroundColor: "#00cc70" },
              },
              formFieldInput: {
                backgroundColor: "#0f1117",
                border: "1px solid #2a2d3e",
                color: "#ffffff",
                "&:focus": { borderColor: "rgba(0,255,136,0.5)" },
              },
              formFieldLabel: { color: "#6b7280" },
              footerActionLink: { color: "#00ff88" },
              dividerLine: { backgroundColor: "#2a2d3e" },
              dividerText: { color: "#6b7280" },
              socialButtonsBlockButton: {
                backgroundColor: "#0f1117",
                border: "1px solid #2a2d3e",
                color: "#ffffff",
                "&:hover": { borderColor: "#6b7280" },
              },
              socialButtonsBlockButtonText: { color: "#ffffff" },
            },
          }}
          fallbackRedirectUrl="/onboarding"
          signInUrl="/login"
        />

        <p className="text-xs text-[#6b7280] mt-6 text-center">
          No contracts. Cancel anytime. Setup fee applies.
        </p>
      </div>
    </div>
  );
}
