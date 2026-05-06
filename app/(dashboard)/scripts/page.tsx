"use client";

import { useState } from "react";
import {
  Lock,
  Zap,
  Save,
  RotateCcw,
  Eye,
  AlertTriangle,
  CheckCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanType } from "@/lib/types";

// ─── Industries ────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  "HVAC",
  "Landscaping",
  "Plumbing",
  "Auto Repair",
  "Electrician",
  "Roofing",
  "Pest Control",
  "Cleaning",
  "Concrete",
  "Fencing",
] as const;

type Industry = (typeof INDUSTRIES)[number];

// ─── Default scripts ──────────────────────────────────────────────────────────

const DEFAULT_SCRIPTS: Record<Industry, string> = {
  HVAC: `Hi, is this [OWNER_NAME]?

Hey [OWNER_NAME], this is Alex calling on behalf of a local marketing platform that works specifically with HVAC contractors in your area. I'll be quick — I know you're busy.

We help HVAC businesses like [BUSINESS_NAME] get 10 to 20 pre-qualified homeowners booked on your calendar each month, without you having to run any ads or make any cold calls yourself. Our AI handles all the outreach and only puts people on your calendar who are actively looking for HVAC services in your service area.

We're currently working with a few contractors in your county and there's one spot left — we don't work with competing businesses in the same area.

Would it make sense to jump on a quick 15-minute call this week so I can show you exactly what it looks like for an HVAC company in [BUSINESS_NAME]'s area?

[OBJECTION: I'm not interested right now]
Totally understand — can I ask what's holding you back? Most of our clients said the same thing before seeing the numbers. I'd hate for you to miss out if it's something I can address.

[OBJECTION: How much does it cost?]
Great question — pricing depends on your area and goals. That's exactly what we'd cover on the call. There's no commitment to talk, and it takes less than 15 minutes.

[OBJECTION: We already have enough leads]
That's awesome — so business is good! We actually work best with contractors who are already doing well and want to scale without hiring more staff. Worth a look?`,

  Landscaping: `Hi, is this [OWNER_NAME]?

Hey [OWNER_NAME], my name is Alex and I'm calling from a lead generation platform that works exclusively with landscaping and lawn care businesses in your area.

Quick question — are you currently looking for new residential or commercial accounts, or are you pretty maxed out right now?

[IF LOOKING] Perfect. We help landscaping companies like [BUSINESS_NAME] get consistent, high-quality client inquiries booked directly onto your calendar — homeowners in your area who are actively searching for landscaping services. No ad spend required on your end, we handle everything.

We're selective — we only partner with one landscaping company per county to protect your competitive edge. I believe there's still an opening in your area.

Would a quick 15-minute call this week work for you so I can walk you through what it looks like?

[IF MAXED OUT]
That's great to hear! We actually work really well with companies that are already full — a lot of our clients use us to pre-build a waitlist or expand into adjacent neighborhoods. It might still be worth a quick conversation. Would Thursday or Friday work?

[OBJECTION: How did you get my number?]
Your business came up through our lead system as a top-rated landscaper in the area. We specifically reach out to established, reputable companies. Take that as a compliment!`,

  Plumbing: `Hi, could I speak with [OWNER_NAME]?

Hey [OWNER_NAME], this is Alex — I'm calling from a platform that helps plumbing contractors get more service calls and installations booked without spending money on ads or SEO.

I'll be honest with you — I'm reaching out to [BUSINESS_NAME] specifically because we have a spot open in your county for a plumbing partner, and we only work with one company per area.

What we do is pretty straightforward: our AI system reaches out to homeowners and property managers in your service area who are actively looking for plumbing services, qualifies them, and gets them booked directly on your calendar. We've seen plumbers go from 5 to 20 new service calls a month in the first 60 days.

I'm not going to take up much of your time — does a quick 15-minute call this week make sense to see if it's a fit?

[OBJECTION: I have enough work through word of mouth]
Word of mouth is gold — no question. But what happens when it slows down, or when you want to grow without depending on referrals? A lot of our clients use us as a second revenue stream they can turn on and off. Might be worth knowing about.

[OBJECTION: I tried marketing before and it didn't work]
I hear that a lot. Most marketing for tradespeople fails because it's generic. What we do is hyper-local and pre-qualified — the people on your calendar already know what they need and are ready to hire. Very different from a Facebook ad that sends tire kickers.`,

  "Auto Repair": `Hi, is [OWNER_NAME] available?

Hey [OWNER_NAME], this is Alex. I work with a platform that helps independent auto repair shops get more vehicle service appointments without competing with the big chains on price or ads.

I'll keep it short — we help shops like [BUSINESS_NAME] connect with local car owners who are actively searching for a trusted mechanic in their area. Our system does the outreach, qualifies the leads, and books them straight onto your service calendar.

We're currently looking for one auto repair shop to partner with in your area. I wanted to reach out to [BUSINESS_NAME] first because of your reputation in the community.

Would it make sense to hop on a quick call this week — maybe 15 minutes — just to see what the numbers could look like for your shop?`,

  Electrician: `Hi, may I speak with [OWNER_NAME]?

Hey [OWNER_NAME], this is Alex calling on behalf of a lead generation platform that works specifically with licensed electricians in your area.

I'll get straight to it — we help electrical contractors like [BUSINESS_NAME] get pre-qualified residential and commercial jobs booked directly on their calendar. No ads to manage, no SEO to deal with — we handle all the outreach and only send you homeowners or property managers who have a real electrical need and are ready to hire.

We're pretty selective — we only work with one electrician per county, so there's no competing with yourself. Your area came up as open.

Would a 15-minute call this week work to see if it makes sense for [BUSINESS_NAME]?`,

  Roofing: `Hi, is this [OWNER_NAME]?

Hey [OWNER_NAME], this is Alex. I work with a platform that helps roofing contractors land more estimate appointments without chasing storm chasers or competing on Angi and HomeAdvisor.

We work with roofing companies like [BUSINESS_NAME] to reach homeowners in your service area who need roof inspections, repairs, or replacements — and we get them scheduled directly on your calendar. Everything is pre-qualified so you're not wasting time on tire kickers.

Quick question — are you currently looking for more residential roofing jobs, or are you focused more on commercial?

[EITHER WAY] Perfect. We have an opening in your county and I'd love to show you what the numbers look like for a roofing company in your area. Would 15 minutes this week work?`,

  "Pest Control": `Hi, could I speak with [OWNER_NAME]?

Hey [OWNER_NAME], quick call — this is Alex from a platform that helps pest control companies get recurring residential accounts booked without door-knocking or running ads.

We connect pest control businesses like [BUSINESS_NAME] with homeowners in your area who are actively dealing with pest issues and are ready to sign up for service. Our system handles all the outreach and gets them on your calendar as confirmed appointments.

We're looking for one pest control partner in your county — is this a good time for a 15-minute call to walk through what it looks like?`,

  Cleaning: `Hi, is this [OWNER_NAME]?

Hey [OWNER_NAME], this is Alex — I'm calling from a platform that helps residential and commercial cleaning companies build consistent monthly revenue without relying on referrals or social media.

We help cleaning businesses like [BUSINESS_NAME] get new clients booked on autopilot — homeowners and property managers who are actively looking for cleaning services get connected with you, pre-qualified, and scheduled directly.

We only work with one cleaning company per area, and your county came up as available. Would 15 minutes this week work to see if it's a fit?`,

  Concrete: `Hi, is this [OWNER_NAME]?

Hey [OWNER_NAME], this is Alex. I work with a lead generation platform that helps concrete contractors land more driveway, patio, and foundation jobs without spending money on ads.

We focus specifically on getting homeowners and property managers who need concrete work in your area booked on your calendar — pre-qualified, ready to get an estimate.

We have an opening in your county for a concrete partner. Would a quick 15-minute call this week work to see what the opportunity looks like for [BUSINESS_NAME]?`,

  Fencing: `Hi, may I speak with [OWNER_NAME]?

Hey [OWNER_NAME], quick question — is [BUSINESS_NAME] actively taking on new fencing jobs right now, or are you booked out a few weeks?

[IF TAKING JOBS] Perfect timing. This is Alex from a platform that helps fencing contractors in your area get more estimate appointments on their calendar without chasing leads or running ads. Homeowners who need fencing get booked directly with you — wood, vinyl, chain link, whatever you specialize in.

We're looking for one fencing company to work with in your county. Would 15 minutes this week work to walk through the details?`,
};

// ─── Preview component ────────────────────────────────────────────────────────

function ScriptPreview({ script }: { script: string }) {
  const preview = script
    .replace(/\[BUSINESS_NAME\]/g, "Sunrise Plumbing")
    .replace(/\[OWNER_NAME\]/g, "Mike Torres");

  return (
    <div className="rounded-xl border border-[#4fc3f7]/20 bg-[#4fc3f7]/5 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Eye className="w-4 h-4 text-[#4fc3f7]" />
        <span className="text-xs font-semibold text-[#4fc3f7] uppercase tracking-wider">Preview</span>
        <span className="text-xs text-[#6b7280]">— values replaced with example</span>
      </div>
      <pre className="text-sm text-[#d1d5db] whitespace-pre-wrap font-sans leading-relaxed">
        {preview}
      </pre>
    </div>
  );
}

// ─── Reset confirmation modal ─────────────────────────────────────────────────

function ResetModal({
  industry,
  onConfirm,
  onClose,
}: {
  industry: Industry;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-[#fbbf24]/20 flex items-center justify-center">
            <RotateCcw className="w-5 h-5 text-[#fbbf24]" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Reset to Default</h3>
            <p className="text-xs text-[#6b7280]">Your edits will be lost</p>
          </div>
        </div>
        <p className="text-sm text-[#9ca3af] mb-6">
          This will replace your custom {industry} script with the default script. Are you sure?
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-[#2a2d3e] text-sm text-[#9ca3af] hover:text-white transition-colors">
            Keep My Script
          </button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className="flex-1 py-2.5 rounded-lg bg-[#fbbf24]/80 hover:bg-[#fbbf24] text-[#0f1117] text-sm font-semibold transition-colors"
          >
            Reset Script
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Upgrade wall ─────────────────────────────────────────────────────────────

function UpgradeWall() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-6 max-w-md mx-auto text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#fbbf24]/10 border border-[#fbbf24]/30 flex items-center justify-center">
        <Lock className="w-8 h-8 text-[#fbbf24]" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Script Editor is a Growth+ Feature</h2>
        <p className="text-sm text-[#9ca3af] leading-relaxed">
          Customize your AI call scripts per industry to maximize bookings. Available on Growth and Pro plans.
        </p>
      </div>
      <div className="w-full rounded-xl border border-[#fbbf24]/20 bg-[#fbbf24]/5 p-4 text-left space-y-2">
        {[
          "Custom scripts per industry",
          "Live preview with example values",
          "Default scripts included as a starting point",
          "Instant AI calling with your script",
        ].map((f) => (
          <div key={f} className="flex items-center gap-2 text-sm text-[#d1d5db]">
            <CheckCircle className="w-4 h-4 text-[#fbbf24] flex-shrink-0" /> {f}
          </div>
        ))}
      </div>
      <a
        href="/settings/billing"
        className="px-6 py-3 rounded-xl bg-[#fbbf24] text-[#0f1117] font-bold text-sm hover:bg-[#fbbf24]/90 transition-colors"
      >
        Upgrade to Growth →
      </a>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

// Demo: user has two targets with these industries
const USER_INDUSTRIES: Industry[] = ["HVAC", "Plumbing"];

export default function ScriptsPage() {
  // Demo plan — in production pull from OrgContext
  const plan = "growth" as PlanType;

  const [activeIndustry, setActiveIndustry] = useState<Industry>(USER_INDUSTRIES[0]);
  const [scripts, setScripts] = useState<Record<Industry, string>>(
    Object.fromEntries(USER_INDUSTRIES.map((i) => [i, DEFAULT_SCRIPTS[i]])) as Record<Industry, string>
  );
  const [savedIndustries, setSavedIndustries] = useState<Set<Industry>>(new Set());
  const [dirtyIndustries, setDirtyIndustries] = useState<Set<Industry>>(new Set());
  const [saving, setSaving] = useState(false);
  const [resetTarget, setResetTarget] = useState<Industry | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  if (plan === "starter") return <UpgradeWall />;

  const currentScript = scripts[activeIndustry] ?? DEFAULT_SCRIPTS[activeIndustry];
  const isDirty = dirtyIndustries.has(activeIndustry);
  const isSaved = savedIndustries.has(activeIndustry) && !isDirty;

  function handleScriptChange(value: string) {
    setScripts((prev) => ({ ...prev, [activeIndustry]: value }));
    setDirtyIndustries((prev) => new Set(prev).add(activeIndustry));
    setSavedIndustries((prev) => {
      const next = new Set(prev);
      next.delete(activeIndustry);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/scripts/${activeIndustry.toLowerCase().replace(/ /g, "-")}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: currentScript }),
    }).catch(() => {});
    setSaving(false);
    setDirtyIndustries((prev) => {
      const next = new Set(prev);
      next.delete(activeIndustry);
      return next;
    });
    setSavedIndustries((prev) => new Set(prev).add(activeIndustry));
  }

  function handleReset() {
    setScripts((prev) => ({ ...prev, [activeIndustry]: DEFAULT_SCRIPTS[activeIndustry] }));
    setDirtyIndustries((prev) => {
      const next = new Set(prev);
      next.delete(activeIndustry);
      return next;
    });
    setSavedIndustries((prev) => {
      const next = new Set(prev);
      next.delete(activeIndustry);
      return next;
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-[#2a2d3e]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Call Scripts</h1>
            <p className="text-sm text-[#6b7280] mt-0.5">
              Customize the script your AI uses when calling leads.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview((p) => !p)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                showPreview
                  ? "border-[#4fc3f7]/30 text-[#4fc3f7] bg-[#4fc3f7]/10"
                  : "border-[#2a2d3e] text-[#6b7280] hover:text-white"
              )}
            >
              <Eye className="w-4 h-4" /> {showPreview ? "Hide" : "Show"} Preview
            </button>
            <button
              onClick={() => setResetTarget(activeIndustry)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2a2d3e] text-sm text-[#6b7280] hover:text-white transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Reset to Default
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                isSaved
                  ? "bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30 cursor-default"
                  : isDirty
                  ? "bg-[#00ff88] text-[#0f1117] hover:bg-[#00ff88]/90"
                  : "bg-[#1a1d2e] border border-[#2a2d3e] text-[#6b7280] cursor-not-allowed"
              )}
            >
              {isSaved ? (
                <><CheckCircle className="w-4 h-4" /> Saved</>
              ) : (
                <><Save className="w-4 h-4" /> {saving ? "Saving…" : "Save Script"}</>
              )}
            </button>
          </div>
        </div>

        {/* Industry tabs */}
        <div className="flex gap-1 mt-4 border-b border-[#2a2d3e] -mb-[1px]">
          {USER_INDUSTRIES.map((industry) => {
            const isActive = activeIndustry === industry;
            const hasDirty = dirtyIndustries.has(industry);
            return (
              <button
                key={industry}
                onClick={() => setActiveIndustry(industry)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px",
                  isActive
                    ? "border-[#00ff88] text-white"
                    : "border-transparent text-[#6b7280] hover:text-[#9ca3af]"
                )}
              >
                <Zap className="w-3.5 h-3.5" />
                {industry}
                {hasDirty && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#fbbf24]" title="Unsaved changes" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Editor */}
      <div className={cn("flex-1 overflow-hidden", showPreview ? "grid grid-cols-2" : "")}>
        {/* Script textarea */}
        <div className="flex flex-col h-full overflow-hidden border-r border-[#2a2d3e]">
          <div className="flex items-center justify-between px-4 py-2 bg-[#1a1d2e] border-b border-[#2a2d3e]">
            <span className="text-xs font-medium text-[#6b7280]">
              {activeIndustry} Script
            </span>
            <span className="text-xs text-[#6b7280]">
              {currentScript.length} chars · Use [BUSINESS_NAME] and [OWNER_NAME] as placeholders
            </span>
          </div>
          <textarea
            value={currentScript}
            onChange={(e) => handleScriptChange(e.target.value)}
            className="flex-1 w-full bg-[#0f1117] text-sm text-[#d1d5db] p-5 resize-none focus:outline-none font-mono leading-relaxed"
            placeholder="Write your call script here..."
            spellCheck={false}
          />
        </div>

        {/* Preview pane */}
        {showPreview && (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 bg-[#1a1d2e] border-b border-[#2a2d3e]">
              <Eye className="w-3.5 h-3.5 text-[#4fc3f7]" />
              <span className="text-xs font-medium text-[#4fc3f7]">Live Preview</span>
              <span className="text-xs text-[#6b7280]">— Sunrise Plumbing / Mike Torres</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5 bg-[#0f1117]">
              <pre className="text-sm text-[#d1d5db] whitespace-pre-wrap font-sans leading-relaxed">
                {currentScript
                  .replace(/\[BUSINESS_NAME\]/g, "Sunrise Plumbing")
                  .replace(/\[OWNER_NAME\]/g, "Mike Torres")}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Reset modal */}
      {resetTarget && (
        <ResetModal
          industry={resetTarget}
          onConfirm={handleReset}
          onClose={() => setResetTarget(null)}
        />
      )}
    </div>
  );
}
