"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Rocket,
  Zap,
  Calendar,
  Target,
  FileText,
  Building2,
  Globe,
  DollarSign,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  businessName: string;
  websiteUrl: string;
  avgJobValue: string;
  targetIndustry: string;
  targetCounty: string;
  targetState: string;
  scriptChoice: "ai" | "custom";
  customScript: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  "HVAC",
  "Plumbing",
  "Roofing",
  "Landscaping",
  "Electrical",
  "Painting",
  "Cleaning Services",
  "Pest Control",
  "Pool & Spa",
  "General Contracting",
  "Insurance",
  "Real Estate",
  "Mortgage",
  "Auto Dealership",
  "Dental / Medical",
];

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
  "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York",
  "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
  "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// ─── Step Components ──────────────────────────────────────────────────────────

interface StepProps {
  formData: FormData;
  onChange: (updates: Partial<FormData>) => void;
}

function StepBusinessInfo({ formData, onChange }: StepProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-white flex items-center gap-2">
          <Building2 className="w-4 h-4 text-[#c8f547]" />
          Business Name
        </label>
        <input
          type="text"
          value={formData.businessName}
          onChange={(e) => onChange({ businessName: e.target.value })}
          placeholder="e.g. Sunrise HVAC Services"
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#c8f547]/50 transition-colors"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-white flex items-center gap-2">
          <Globe className="w-4 h-4 text-[#c8f547]" />
          Website URL
          <span className="text-xs font-normal text-[#6b7280]">(optional — helps AI write a better script)</span>
        </label>
        <input
          type="url"
          value={formData.websiteUrl}
          onChange={(e) => onChange({ websiteUrl: e.target.value })}
          placeholder="https://yourbusiness.com"
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#c8f547]/50 transition-colors"
        />
        <p className="text-xs text-[#6b7280]">
          LeadEmm&apos;s AI reads your website to understand your services and write a call script that sounds like you.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-white flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-[#c8f547]" />
          Average Job Value
          <span className="text-xs font-normal text-[#6b7280]">(optional)</span>
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6b7280] text-sm">$</span>
          <input
            type="number"
            min="0"
            value={formData.avgJobValue}
            onChange={(e) => onChange({ avgJobValue: e.target.value })}
            placeholder="500"
            className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-xl pl-8 pr-4 py-3 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#c8f547]/50 transition-colors"
          />
        </div>
        <p className="text-xs text-[#6b7280]">
          Used to calculate estimated revenue recovered on your dashboard.
        </p>
      </div>
    </div>
  );
}

function StepFirstTarget({ formData, onChange }: StepProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-white">Industry</label>
        <p className="text-xs text-[#6b7280]">What type of business are you targeting?</p>
        <select
          value={formData.targetIndustry}
          onChange={(e) => onChange({ targetIndustry: e.target.value })}
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#c8f547]/50 transition-colors"
        >
          <option value="">Select an industry…</option>
          {INDUSTRIES.map((ind) => (
            <option key={ind} value={ind}>
              {ind}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-white">County</label>
        <p className="text-xs text-[#6b7280]">Target a specific county for hyper-local lead generation.</p>
        <input
          type="text"
          value={formData.targetCounty}
          onChange={(e) => onChange({ targetCounty: e.target.value })}
          placeholder="e.g. Maricopa County"
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#c8f547]/50 transition-colors"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-white">State</label>
        <select
          value={formData.targetState}
          onChange={(e) => onChange({ targetState: e.target.value })}
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#c8f547]/50 transition-colors"
        >
          <option value="">Select a state…</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function StepGoogleCalendar() {
  const isConnected =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("connected") === "true";

  return (
    <div className="space-y-5">
      <p className="text-sm text-[#6b7280] leading-relaxed">
        LeadEmm books appointments directly onto your Google Calendar when a prospect says yes.
        Connect now so every booked call lands automatically — no manual entry.
      </p>

      {isConnected ? (
        <div className="flex items-center gap-3 bg-[#00ff88]/10 border border-[#00ff88]/20 rounded-xl px-5 py-4">
          <Check className="w-5 h-5 text-[#00ff88] shrink-0" />
          <div>
            <p className="text-sm font-semibold text-[#00ff88]">Google Calendar Connected</p>
            <p className="text-xs text-[#6b7280] mt-0.5">
              Appointments will be created automatically.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <a
            href="/api/auth/google"
            className="inline-flex items-center gap-3 bg-white text-gray-800 font-semibold px-6 py-3 rounded-xl hover:bg-gray-100 transition-colors text-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Connect Google Calendar →
          </a>
          <p className="text-xs text-[#6b7280]">
            You can skip this and connect later in Settings. LeadEmm will still run calls — bookings just won&apos;t auto-create on your calendar yet.
          </p>
        </div>
      )}
    </div>
  );
}

function StepScript({ formData, onChange }: StepProps) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {(["ai", "custom"] as const).map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => onChange({ scriptChoice: choice })}
            className={cn(
              "relative flex flex-col items-start gap-1.5 p-4 rounded-xl border text-left transition-all",
              formData.scriptChoice === choice
                ? "border-[#c8f547] bg-[#c8f547]/5"
                : "border-[#2a2d3e] bg-[#0f1117] hover:border-[#3a3d4e]"
            )}
          >
            {formData.scriptChoice === choice && (
              <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#c8f547] flex items-center justify-center">
                <Check className="w-3 h-3 text-[#0f1117]" />
              </span>
            )}
            <span className="text-sm font-semibold text-white">
              {choice === "ai" ? "AI-Generated Script" : "Write My Own"}
            </span>
            <span className="text-xs text-[#6b7280]">
              {choice === "ai"
                ? "LeadEmm reads your website and writes a custom script for your industry and location. Recommended."
                : "Write your own opening, value prop, and closing tailored to your voice."}
            </span>
          </button>
        ))}
      </div>

      {formData.scriptChoice === "ai" && (
        <div className="flex items-start gap-3 bg-[#c8f547]/5 border border-[#c8f547]/20 rounded-xl px-4 py-3">
          <Zap className="w-4 h-4 text-[#c8f547] shrink-0 mt-0.5" />
          <p className="text-xs text-[#c8f547]/80 leading-relaxed">
            LeadEmm will generate your script after setup using your business info
            {formData.websiteUrl ? ` and your website (${formData.websiteUrl})` : ""}. You can edit it anytime from the Scripts page.
          </p>
        </div>
      )}

      {formData.scriptChoice === "custom" && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-white">Your Script</label>
          <p className="text-xs text-[#6b7280]">
            Use{" "}
            <code className="text-[#4fc3f7]">[Business Name]</code> and{" "}
            <code className="text-[#4fc3f7]">[County]</code> as placeholders — LeadEmm fills them in per call.
          </p>
          <textarea
            value={formData.customScript}
            onChange={(e) => onChange({ customScript: e.target.value })}
            rows={6}
            placeholder="Hi, this is Jamie calling on behalf of [Business Name]…"
            className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#c8f547]/50 transition-colors resize-none"
          />
        </div>
      )}
    </div>
  );
}

function StepReview({ formData }: { formData: FormData }) {
  const isCalendarConnected =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("connected") === "true";

  const rows: Array<{ label: string; value: string; highlight?: boolean }> = [
    { label: "Business Name", value: formData.businessName || "Not set" },
    { label: "Website", value: formData.websiteUrl || "Not provided" },
    { label: "Avg Job Value", value: formData.avgJobValue ? `$${formData.avgJobValue}` : "$500 (default)" },
    { label: "Target Industry", value: formData.targetIndustry || "Not set" },
    { label: "Target County", value: formData.targetCounty || "Not set" },
    { label: "Target State", value: formData.targetState || "Not set" },
    { label: "Google Calendar", value: isCalendarConnected ? "Connected" : "Not connected (can add later)" },
    { label: "Call Script", value: formData.scriptChoice === "ai" ? "AI-generated (written after launch)" : "Custom script" },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[#0f1117] border border-[#2a2d3e] rounded-xl overflow-hidden">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={cn(
              "flex items-center justify-between px-5 py-3 text-sm",
              i !== rows.length - 1 ? "border-b border-[#2a2d3e]/50" : ""
            )}
          >
            <span className="text-[#6b7280]">{row.label}</span>
            <span className="text-white font-medium text-right max-w-[220px] truncate">
              {row.value}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-[#6b7280]">
        Everything looks good? Click Launch — LeadEmm will pull your first leads and start calls automatically.
      </p>
    </div>
  );
}

// ─── Step Config ──────────────────────────────────────────────────────────────

const STEPS = [
  { number: 1, title: "Your Business", subtitle: "Tell us about your business", icon: Building2 },
  { number: 2, title: "First Target", subtitle: "Pick the industry and location to target", icon: Target },
  { number: 3, title: "Google Calendar", subtitle: "Auto-book appointments (optional)", icon: Calendar },
  { number: 4, title: "Call Script", subtitle: "How LeadEmm opens every call", icon: FileText },
  { number: 5, title: "Review & Launch", subtitle: "Confirm and go live", icon: Rocket },
];

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-10">
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1;
        const isComplete = step < currentStep;
        const isCurrent = step === currentStep;
        return (
          <div key={step} className="flex items-center flex-1">
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0 transition-all duration-300",
                isComplete
                  ? "bg-[#c8f547] border-[#c8f547] text-[#0f1117]"
                  : isCurrent
                  ? "border-[#c8f547] text-[#c8f547] bg-transparent"
                  : "border-[#2a2d3e] text-[#6b7280] bg-transparent"
              )}
            >
              {isComplete ? <Check className="w-3.5 h-3.5" /> : step}
            </div>
            {step < totalSteps && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-1 transition-all duration-300",
                  isComplete ? "bg-[#c8f547]" : "bg-[#2a2d3e]"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Save helper ──────────────────────────────────────────────────────────────

async function saveStep(formData: FormData) {
  try {
    await fetch("/api/settings/integrations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_name: formData.businessName || undefined,
        website_url: formData.websiteUrl || undefined,
        avg_job_value: formData.avgJobValue ? parseInt(formData.avgJobValue, 10) : undefined,
        target_industry: formData.targetIndustry || undefined,
        target_county: formData.targetCounty || undefined,
        target_state: formData.targetState || undefined,
        script_choice: formData.scriptChoice,
        custom_script: formData.customScript || undefined,
      }),
    });
  } catch {
    // Non-blocking
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

function canAdvance(step: number, formData: FormData): boolean {
  if (step === 1) return formData.businessName.trim().length > 0;
  if (step === 2) return formData.targetIndustry.length > 0 && formData.targetState.length > 0;
  if (step === 4) return formData.scriptChoice === "ai" || formData.customScript.trim().length > 0;
  return true;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [launching, setLaunching] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    businessName: "",
    websiteUrl: "",
    avgJobValue: "",
    targetIndustry: "",
    targetCounty: "",
    targetState: "",
    scriptChoice: "ai",
    customScript: "",
  });

  const onChange = useCallback((updates: Partial<FormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  }, []);

  const goNext = async () => {
    await saveStep(formData);
    setCurrentStep((s) => Math.min(s + 1, STEPS.length));
  };

  const goBack = () => setCurrentStep((s) => Math.max(s - 1, 1));

  const launch = async () => {
    setLaunching(true);
    try {
      await saveStep(formData);
      await fetch("/api/onboarding/complete", { method: "POST" });
      router.push("/dashboard");
    } catch {
      setLaunching(false);
    }
  };

  const step = STEPS[currentStep - 1];
  const StepIcon = step.icon;
  const canGoNext = canAdvance(currentStep, formData);

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#c8f547]/10 border border-[#c8f547]/20 mb-4">
            <Zap className="w-6 h-6 text-[#c8f547]" />
          </div>
          <h1 className="text-2xl font-black text-white">LeadEmm Setup</h1>
          <p className="text-sm text-[#6b7280] mt-1">Get live in under 5 minutes.</p>
        </div>

        {/* Card */}
        <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-2xl p-6 shadow-2xl">
          <ProgressBar currentStep={currentStep} totalSteps={STEPS.length} />

          {/* Step header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[#c8f547]/10 border border-[#c8f547]/20 flex items-center justify-center">
              <StepIcon className="w-5 h-5 text-[#c8f547]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{step.title}</h2>
              <p className="text-xs text-[#6b7280]">{step.subtitle}</p>
            </div>
          </div>

          {/* Step content */}
          <div className="min-h-[200px]">
            {currentStep === 1 && <StepBusinessInfo formData={formData} onChange={onChange} />}
            {currentStep === 2 && <StepFirstTarget formData={formData} onChange={onChange} />}
            {currentStep === 3 && <StepGoogleCalendar />}
            {currentStep === 4 && <StepScript formData={formData} onChange={onChange} />}
            {currentStep === 5 && <StepReview formData={formData} />}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-5 border-t border-[#2a2d3e]">
            <button
              type="button"
              onClick={goBack}
              disabled={currentStep === 1}
              className="flex items-center gap-2 text-sm text-[#6b7280] hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            <div className="flex items-center gap-3">
              {/* Calendar step is skippable */}
              {currentStep === 3 && (
                <button
                  type="button"
                  onClick={goNext}
                  className="text-sm text-[#6b7280] hover:text-white transition-colors px-3 py-2 rounded-lg border border-[#2a2d3e] hover:border-[#6b7280]"
                >
                  Skip for now
                </button>
              )}

              {currentStep < STEPS.length ? (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!canGoNext}
                  className="flex items-center gap-2 bg-[#c8f547] text-[#0f1117] font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-[#b8e030] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={launch}
                  disabled={launching}
                  className="flex items-center gap-2 bg-[#c8f547] text-[#0f1117] font-black px-6 py-2.5 rounded-xl text-sm hover:bg-[#b8e030] transition-colors disabled:opacity-60"
                >
                  {launching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Rocket className="w-4 h-4" />
                  )}
                  {launching ? "Launching…" : "Launch LeadEmm"}
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-[#6b7280] mt-5">
          Step {currentStep} of {STEPS.length} — You can update any of this in Settings later.
        </p>
      </div>
    </div>
  );
}
