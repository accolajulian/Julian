"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
  Copy,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Rocket,
  Zap,
  Calendar,
  Phone,
  Target,
  FileText,
  Eye,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  apolloKey: string;
  atlasKey: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhone: string;
  targetIndustry: string;
  targetCounty: string;
  targetState: string;
  scriptChoice: "default" | "custom";
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

const DEFAULT_SCRIPTS: Record<string, string> = {
  HVAC: `Hi, this is Jamie calling on behalf of [Business Name]. I'm reaching out because we help HVAC companies in [County] grow their service revenue through targeted outreach. We've helped several local contractors book 5–10 new jobs per month on autopilot. Is this a good time to talk for just 2 minutes?`,
  Plumbing: `Hi, this is Jamie calling on behalf of [Business Name]. We specialize in helping plumbing companies fill their schedule with qualified service calls. We pull leads from verified local contractors and businesses in your area who need plumbing work. Can I share how we've helped other plumbers in [County] add $15k+ per month?`,
  Roofing: `Hi, this is Jamie with [Business Name]. I'm calling because we help roofing contractors in [County] find homeowners with storm-damaged or aging roofs who need estimates. Our clients typically see 3–7 booked appointments per week from day one. Do you have 2 minutes?`,
  Landscaping: `Hi, this is Jamie from [Business Name]. We help landscaping and lawn care businesses get in front of commercial property owners and HOAs looking for seasonal maintenance contracts. We've filled schedules for several companies in your area. Got 2 minutes to hear how?`,
  Electrical: `Hi, I'm Jamie calling on behalf of [Business Name]. We connect electrical contractors in [County] with qualified commercial and residential clients who need electrical work scheduled. Our clients typically book 4–8 new jobs per week. Is this a good time?`,
  Painting: `Hi, this is Jamie with [Business Name]. We help painting contractors find homeowners ready to book interior and exterior painting projects. We target your county specifically so every lead is local. Can I take 2 minutes to explain how it works?`,
  "Cleaning Services": `Hi, this is Jamie from [Business Name]. We help residential and commercial cleaning companies secure recurring service contracts in [County]. Our clients see immediate calendar fills within the first week. Do you have 2 minutes?`,
  "Pest Control": `Hi, I'm Jamie calling from [Business Name]. We specialize in helping pest control companies reach property owners who need treatment in [County]. Our AI handles outreach 24/7 so you never miss a lead. Got 2 minutes?`,
  "Pool & Spa": `Hi, this is Jamie with [Business Name]. We help pool and spa service companies reach homeowners looking for cleaning, repair, and seasonal service contracts in your area. Can I take 2 minutes to show you how we fill calendars for businesses like yours?`,
  "General Contracting": `Hi, I'm Jamie calling on behalf of [Business Name]. We help general contractors find commercial and residential renovation projects in [County] before they go to bid. Our clients are booking 6-figure projects from our leads. Is now a good time?`,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// ─── Step Components ──────────────────────────────────────────────────────────

interface StepProps {
  formData: FormData;
  onChange: (updates: Partial<FormData>) => void;
}

function StepApollo({ formData, onChange }: StepProps) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const testConnection = async () => {
    if (!formData.apolloKey) return;
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/settings/test-integration?service=apollo&key=${encodeURIComponent(formData.apolloKey)}`
      );
      const data = await res.json();
      setResult({ ok: data.ok, message: data.message ?? (data.ok ? "Connected!" : "Failed") });
    } catch {
      setResult({ ok: false, message: "Could not reach Apollo. Check your API key." });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-white">Your Apollo.io API Key</label>
        <p className="text-xs text-[#6b7280]">
          Find this in Apollo.io → Settings → Integrations → API Keys.
        </p>
        <input
          type="password"
          value={formData.apolloKey}
          onChange={(e) => onChange({ apolloKey: e.target.value })}
          placeholder="apollo_sk_…"
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#00ff88]/50 transition-colors"
        />
      </div>
      <button
        type="button"
        onClick={testConnection}
        disabled={testing || !formData.apolloKey}
        className="flex items-center gap-2 border border-[#2a2d3e] text-[#6b7280] hover:text-white hover:border-[#00ff88]/30 px-4 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-40"
      >
        {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
        Test Connection
      </button>
      {result && (
        <div
          className={cn(
            "flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl",
            result.ok
              ? "bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
          )}
        >
          {result.ok ? <Check className="w-4 h-4 shrink-0" /> : <X className="w-4 h-4 shrink-0" />}
          {result.ok ? "✓ Connected" : "✗ Failed"} — {result.message}
        </div>
      )}
    </div>
  );
}

function StepAtlas({ formData, onChange }: StepProps) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const webhookUrl =
    (typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL ?? "") +
    "/api/webhooks/atlas";

  const testConnection = async () => {
    if (!formData.atlasKey) return;
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/settings/test-integration?service=atlas&key=${encodeURIComponent(formData.atlasKey)}`
      );
      const data = await res.json();
      setResult({ ok: data.ok, message: data.message ?? (data.ok ? "Connected!" : "Failed") });
    } catch {
      setResult({ ok: false, message: "Could not reach Atlas AI. Check your API key." });
    } finally {
      setTesting(false);
    }
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-white">Atlas AI API Key</label>
        <p className="text-xs text-[#6b7280]">
          Find this in your Atlas AI dashboard under Settings → API.
        </p>
        <input
          type="password"
          value={formData.atlasKey}
          onChange={(e) => onChange({ atlasKey: e.target.value })}
          placeholder="atlas_sk_…"
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#00ff88]/50 transition-colors"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-white">Webhook URL</label>
        <p className="text-xs text-[#6b7280]">
          Paste this into Atlas AI → Settings → Webhooks so call outcomes sync automatically.
        </p>
        <div className="flex items-center gap-2 bg-[#0f1117] border border-[#2a2d3e] rounded-xl px-4 py-3">
          <code className="text-xs text-[#4fc3f7] flex-1 truncate">{webhookUrl}</code>
          <button
            type="button"
            onClick={copyWebhook}
            className="text-[#6b7280] hover:text-white transition-colors shrink-0"
          >
            {copied ? (
              <Check className="w-4 h-4 text-[#00ff88]" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={testConnection}
        disabled={testing || !formData.atlasKey}
        className="flex items-center gap-2 border border-[#2a2d3e] text-[#6b7280] hover:text-white hover:border-[#00ff88]/30 px-4 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-40"
      >
        {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
        Test Connection
      </button>

      {result && (
        <div
          className={cn(
            "flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl",
            result.ok
              ? "bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
          )}
        >
          {result.ok ? <Check className="w-4 h-4 shrink-0" /> : <X className="w-4 h-4 shrink-0" />}
          {result.ok ? "✓ Connected" : "✗ Failed"} — {result.message}
        </div>
      )}
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
        LeadMey needs access to your Google Calendar to automatically create appointments when a
        lead books. Click the button below to authorize.
      </p>

      {isConnected ? (
        <div className="flex items-center gap-3 bg-[#00ff88]/10 border border-[#00ff88]/20 rounded-xl px-5 py-4">
          <Check className="w-5 h-5 text-[#00ff88] shrink-0" />
          <div>
            <p className="text-sm font-semibold text-[#00ff88]">Google Calendar Connected</p>
            <p className="text-xs text-[#6b7280] mt-0.5">
              LeadMey can now create calendar events automatically.
            </p>
          </div>
        </div>
      ) : (
        <a
          href="/api/auth/google"
          className="inline-flex items-center gap-3 bg-white text-gray-800 font-semibold px-6 py-3 rounded-xl hover:bg-gray-100 transition-colors text-sm"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Connect Google Calendar →
        </a>
      )}

      <p className="text-xs text-[#6b7280]">
        LeadMey only requests permission to read and create calendar events. We never delete or
        modify existing events.
      </p>
    </div>
  );
}

function StepTwilio({ formData, onChange }: StepProps & { onSkip: () => void }) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-white">Account SID</label>
        <input
          type="password"
          value={formData.twilioAccountSid}
          onChange={(e) => onChange({ twilioAccountSid: e.target.value })}
          placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#00ff88]/50 transition-colors"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-white">Auth Token</label>
        <input
          type="password"
          value={formData.twilioAuthToken}
          onChange={(e) => onChange({ twilioAuthToken: e.target.value })}
          placeholder="your_auth_token"
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#00ff88]/50 transition-colors"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-white">Phone Number</label>
        <input
          type="text"
          value={formData.twilioPhone}
          onChange={(e) => onChange({ twilioPhone: e.target.value })}
          placeholder="+15550001234"
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#00ff88]/50 transition-colors"
        />
      </div>
    </div>
  );
}

function StepFirstTarget({ formData, onChange }: StepProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-white">Industry</label>
        <p className="text-xs text-[#6b7280]">What type of service business are you targeting?</p>
        <select
          value={formData.targetIndustry}
          onChange={(e) => onChange({ targetIndustry: e.target.value })}
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#00ff88]/50 transition-colors"
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
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#00ff88]/50 transition-colors"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-white">State</label>
        <select
          value={formData.targetState}
          onChange={(e) => onChange({ targetState: e.target.value })}
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#00ff88]/50 transition-colors"
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

function StepScript({ formData, onChange }: StepProps) {
  const [showPreview, setShowPreview] = useState(false);
  const script =
    DEFAULT_SCRIPTS[formData.targetIndustry] ??
    DEFAULT_SCRIPTS["HVAC"];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {(["default", "custom"] as const).map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => onChange({ scriptChoice: choice })}
            className={cn(
              "relative flex flex-col items-start gap-1.5 p-4 rounded-xl border text-left transition-all",
              formData.scriptChoice === choice
                ? "border-[#00ff88] bg-[#00ff88]/5"
                : "border-[#2a2d3e] bg-[#0f1117] hover:border-[#2a2d3e]/80"
            )}
          >
            {formData.scriptChoice === choice && (
              <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#00ff88] flex items-center justify-center">
                <Check className="w-3 h-3 text-[#0f1117]" />
              </span>
            )}
            <span className="text-sm font-semibold text-white">
              {choice === "default" ? "Use Default Script" : "Write Custom Script"}
            </span>
            <span className="text-xs text-[#6b7280]">
              {choice === "default"
                ? "Proven script tuned for your industry. Recommended for first-time users."
                : "Write your own opening, value prop, and closing tailored to your voice."}
            </span>
          </button>
        ))}
      </div>

      {formData.scriptChoice === "default" && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="flex items-center gap-2 text-xs text-[#4fc3f7] hover:text-[#4fc3f7]/80 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            {showPreview ? "Hide preview" : "Preview default script"}
          </button>
          {showPreview && (
            <div className="bg-[#0f1117] border border-[#2a2d3e] rounded-xl p-4">
              <p className="text-xs text-[#6b7280] leading-relaxed whitespace-pre-line">
                {script.replace("[County]", formData.targetCounty || "your county")}
              </p>
            </div>
          )}
        </div>
      )}

      {formData.scriptChoice === "custom" && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-white">Your Custom Script</label>
          <p className="text-xs text-[#6b7280]">
            Use <code className="text-[#4fc3f7]">[Business Name]</code> and{" "}
            <code className="text-[#4fc3f7]">[County]</code> as placeholders.
          </p>
          <textarea
            value={formData.customScript}
            onChange={(e) => onChange({ customScript: e.target.value })}
            rows={6}
            placeholder="Hi, this is Jamie calling on behalf of [Business Name]…"
            className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#00ff88]/50 transition-colors resize-none"
          />
        </div>
      )}
    </div>
  );
}

function StepReview({ formData }: { formData: FormData }) {
  const rows: Array<{ label: string; value: string; sensitive?: boolean }> = [
    { label: "Apollo.io API Key", value: formData.apolloKey ? "••••••••" + formData.apolloKey.slice(-4) : "Not set", sensitive: true },
    { label: "Atlas AI API Key", value: formData.atlasKey ? "••••••••" + formData.atlasKey.slice(-4) : "Not set", sensitive: true },
    { label: "Google Calendar", value: typeof window !== "undefined" && new URLSearchParams(window.location.search).get("connected") === "true" ? "Connected" : "Not yet connected" },
    { label: "Twilio", value: formData.twilioAccountSid ? "Configured" : "Skipped" },
    { label: "Target Industry", value: formData.targetIndustry || "Not set" },
    { label: "County", value: formData.targetCounty || "Not set" },
    { label: "State", value: formData.targetState || "Not set" },
    { label: "Call Script", value: formData.scriptChoice === "default" ? "Default (industry-tuned)" : "Custom script" },
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
            <span className="text-white font-medium text-right max-w-[200px] truncate">
              {row.value}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-[#6b7280]">
        Everything looks good? Click Launch to start your first lead pull and call campaign.
      </p>
    </div>
  );
}

// ─── Step Config ──────────────────────────────────────────────────────────────

const STEPS = [
  { number: 1, title: "Connect Apollo", subtitle: "Pull leads from Apollo.io automatically", icon: Zap },
  { number: 2, title: "Connect Atlas AI", subtitle: "AI voice agent for outbound calls", icon: Phone },
  { number: 3, title: "Google Calendar", subtitle: "Auto-book appointments to your calendar", icon: Calendar },
  { number: 4, title: "Connect Twilio", subtitle: "Phone infrastructure for calling (optional)", icon: Phone },
  { number: 5, title: "Set First Target", subtitle: "Define the industry and location to target", icon: Target },
  { number: 6, title: "Call Script", subtitle: "Choose how LeadMey opens every call", icon: FileText },
  { number: 7, title: "Review & Launch", subtitle: "Confirm your settings and go live", icon: Rocket },
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
                  ? "bg-[#00ff88] border-[#00ff88] text-[#0f1117]"
                  : isCurrent
                  ? "border-[#00ff88] text-[#00ff88] bg-transparent"
                  : "border-[#2a2d3e] text-[#6b7280] bg-transparent"
              )}
            >
              {isComplete ? <Check className="w-3.5 h-3.5" /> : step}
            </div>
            {step < totalSteps && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-1 transition-all duration-300",
                  isComplete ? "bg-[#00ff88]" : "bg-[#2a2d3e]"
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
        apollo_api_key: formData.apolloKey || undefined,
        atlas_api_key: formData.atlasKey || undefined,
        twilio_account_sid: formData.twilioAccountSid || undefined,
        twilio_auth_token: formData.twilioAuthToken || undefined,
        twilio_phone_number: formData.twilioPhone || undefined,
        target_industry: formData.targetIndustry || undefined,
        target_county: formData.targetCounty || undefined,
        target_state: formData.targetState || undefined,
        script_choice: formData.scriptChoice,
        custom_script: formData.customScript || undefined,
      }),
    });
  } catch {
    // Non-blocking — user can proceed even if save fails
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [launching, setLaunching] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    apolloKey: "",
    atlasKey: "",
    twilioAccountSid: "",
    twilioAuthToken: "",
    twilioPhone: "",
    targetIndustry: "",
    targetCounty: "",
    targetState: "",
    scriptChoice: "default",
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

  const skipTwilio = async () => {
    await saveStep(formData);
    setCurrentStep(5);
  };

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

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#00ff88]/10 border border-[#00ff88]/20 mb-4">
            <Zap className="w-6 h-6 text-[#00ff88]" />
          </div>
          <h1 className="text-2xl font-black text-white">LeadMey Setup</h1>
          <p className="text-sm text-[#6b7280] mt-1">Let&apos;s get you live in 5 minutes.</p>
        </div>

        {/* Card */}
        <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-2xl p-6 shadow-2xl">
          <ProgressBar currentStep={currentStep} totalSteps={STEPS.length} />

          {/* Step header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/20 flex items-center justify-center">
              <StepIcon className="w-5 h-5 text-[#00ff88]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{step.title}</h2>
              <p className="text-xs text-[#6b7280]">{step.subtitle}</p>
            </div>
          </div>

          {/* Step content */}
          <div className="min-h-[200px]">
            {currentStep === 1 && <StepApollo formData={formData} onChange={onChange} />}
            {currentStep === 2 && <StepAtlas formData={formData} onChange={onChange} />}
            {currentStep === 3 && <StepGoogleCalendar />}
            {currentStep === 4 && (
              <StepTwilio formData={formData} onChange={onChange} onSkip={skipTwilio} />
            )}
            {currentStep === 5 && <StepFirstTarget formData={formData} onChange={onChange} />}
            {currentStep === 6 && <StepScript formData={formData} onChange={onChange} />}
            {currentStep === 7 && <StepReview formData={formData} />}
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
              {currentStep === 4 && (
                <button
                  type="button"
                  onClick={skipTwilio}
                  className="text-sm text-[#6b7280] hover:text-white transition-colors px-3 py-2 rounded-lg border border-[#2a2d3e] hover:border-[#6b7280]"
                >
                  Skip
                </button>
              )}

              {currentStep < STEPS.length ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="flex items-center gap-2 bg-[#00ff88] text-[#0f1117] font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-[#00cc70] transition-colors"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={launch}
                  disabled={launching}
                  className="flex items-center gap-2 bg-[#00ff88] text-[#0f1117] font-black px-6 py-2.5 rounded-xl text-sm hover:bg-[#00cc70] transition-colors disabled:opacity-60"
                >
                  {launching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Rocket className="w-4 h-4" />
                  )}
                  {launching ? "Launching…" : "🚀 Launch LeadMey"}
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-[#6b7280] mt-5">
          Step {currentStep} of {STEPS.length} — You can always update these in Settings.
        </p>
      </div>
    </div>
  );
}
