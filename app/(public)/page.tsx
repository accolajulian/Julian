"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Zap,
  Phone,
  Calendar,
  Search,
  MapPin,
  ArrowRight,
  Play,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Star,
  TrendingUp,
  Clock,
  Users,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Navbar from "@/components/shared/Navbar";
import Footer from "@/components/shared/Footer";

// ─── Live activity feed items ─────────────────────────────────────────────────
const ACTIVITY_FEED = [
  { id: 1, text: "New lead found: ABC HVAC, Phoenix AZ", time: "just now", type: "lead" },
  { id: 2, text: "AI call placed to Desert Plumbing Co.", time: "2m ago", type: "call" },
  { id: 3, text: "Appointment booked: Friday 2:00 PM", time: "4m ago", type: "booking" },
  { id: 4, text: "New lead found: Green Lawn Services", time: "7m ago", type: "lead" },
  { id: 5, text: "AI call placed to Sunrise Roofing", time: "9m ago", type: "call" },
  { id: 6, text: "Appointment booked: Monday 10:00 AM", time: "12m ago", type: "booking" },
];

// ─── FAQ data ─────────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: "How does the AI calling work?",
    a: "LeadEmm uses Atlas AI to place outbound calls with a natural, human-sounding voice. The AI introduces your business, qualifies the prospect, and books an appointment — all without you lifting a finger. Calls are recorded and logged to your dashboard.",
  },
  {
    q: "What if someone doesn't answer?",
    a: "LeadEmm automatically retries unanswered calls up to 3 times across different times of day. If a prospect still doesn't answer, they're tagged for SMS follow-up (on Growth and Pro plans) and added to a re-call queue.",
  },
  {
    q: "Can I customize the call script?",
    a: "Yes — on Growth and Pro plans you can fully customize the call script per industry and location target. Our onboarding team helps you craft scripts that convert. On Starter, we use proven default scripts tailored to your industry.",
  },
  {
    q: "How long until I see bookings?",
    a: "Most customers see their first booked appointment within 48–72 hours of going live. The system starts pulling leads and making calls immediately after your $400 setup and onboarding is complete.",
  },
  {
    q: "What integrations do you need?",
    a: "LeadEmm connects to Apollo.io for lead sourcing, Atlas AI for calls, and Google Calendar for booking. Setup takes about 30 minutes with our guided onboarding flow — no code required.",
  },
  {
    q: "Is there a contract?",
    a: "No long-term contracts. All plans are month-to-month. Annual plans save you 17% and are billed yearly, but you can cancel before your renewal date. The $400 setup fee is one-time and non-refundable.",
  },
];

// ─── Testimonials ─────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    name: "Marcus T.",
    role: "Owner, Desert Comfort HVAC",
    body: "I was spending 3 hours a day chasing leads. Now LeadEmm does it while I sleep. Booked $18k in new jobs in the first two weeks.",
    stars: 5,
  },
  {
    name: "Deb & Ron K.",
    role: "Owners, GreenScape Landscaping",
    body: "Skeptical at first — but the AI sounds incredibly natural. Customers often don't realize they're talking to a bot until after they've booked. Our calendar filled up in days.",
    stars: 5,
  },
  {
    name: "Steve M.",
    role: "Owner, Rapid Response Plumbing",
    body: "The ROI was obvious after week one. We paid for the entire year of LeadEmm with a single job it booked on day three.",
    stars: 5,
  },
];

// ─── FAQ accordion item ───────────────────────────────────────────────────────
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
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0f1117] text-white">
      <Navbar />

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="relative pt-28 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Background gradient blobs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[#00ff88]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-20 right-0 w-[400px] h-[400px] bg-[#4fc3f7]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left — copy */}
            <div>
              <div className="inline-flex items-center gap-2 bg-[#00ff88]/10 border border-[#00ff88]/20 rounded-full px-4 py-1.5 mb-6">
                <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse-green" />
                <span className="text-[#00ff88] text-xs font-semibold tracking-wide uppercase">
                  AI-Powered Lead Generation
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight mb-6">
                Your AI Sales Team.{" "}
                <span className="text-[#00ff88] glow-text-accent">Running 24/7.</span>
              </h1>

              <p className="text-lg text-[#6b7280] leading-relaxed mb-8 max-w-lg">
                LeadEmm pulls leads, calls them with AI, and books appointments into your
                calendar — while you focus on the work.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <Link
                  href="#"
                  className="inline-flex items-center justify-center gap-2 bg-[#00ff88] text-[#0f1117] font-bold px-7 py-3.5 rounded-xl hover:bg-[#00ff88]/90 transition-colors text-base"
                >
                  Start Free Trial <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  href="#"
                  className="inline-flex items-center justify-center gap-2 border border-[#2a2d3e] text-white font-semibold px-7 py-3.5 rounded-xl hover:border-[#4fc3f7]/40 hover:text-[#4fc3f7] transition-colors text-base"
                >
                  <Play className="w-4 h-4" /> Watch Demo
                </Link>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <span className="text-sm text-[#6b7280]">
                  Trusted by <span className="text-white font-semibold">500+</span> service businesses
                </span>
              </div>
            </div>

            {/* Right — animated dashboard mockup */}
            <div className="relative">
              <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-2xl p-5 shadow-2xl">
                {/* Mockup header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  </div>
                  <span className="text-xs text-[#6b7280] font-mono">autopilot — live</span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse-green" />
                    <span className="text-xs text-[#00ff88] font-semibold">ACTIVE</span>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: "Leads Today", value: "23" },
                    { label: "Calls Made", value: "18" },
                    { label: "Booked", value: "7" },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-[#0f1117] rounded-lg p-3 text-center">
                      <p className="text-xl font-black text-[#00ff88]">{stat.value}</p>
                      <p className="text-xs text-[#6b7280] mt-0.5">{stat.label}</p>
                    </div>
                  ))}
                </div>

                {/* Activity feed */}
                <div className="space-y-2">
                  <p className="text-xs text-[#6b7280] font-semibold uppercase tracking-wide mb-2">
                    Live Activity
                  </p>
                  {ACTIVITY_FEED.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-2.5 bg-[#0f1117] rounded-lg px-3 py-2.5"
                    >
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full mt-1 shrink-0 animate-pulse-green",
                          item.type === "booking"
                            ? "bg-[#00ff88]"
                            : item.type === "call"
                            ? "bg-[#4fc3f7]"
                            : "bg-yellow-400"
                        )}
                      />
                      <span className="text-xs text-[#6b7280] flex-1 leading-relaxed">
                        {item.text}
                      </span>
                      <span className="text-xs text-[#2a2d3e] shrink-0">{item.time}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Outer glow */}
              <div className="absolute inset-0 rounded-2xl bg-[#00ff88]/5 blur-2xl -z-10" />
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black mb-4">How It Works</h2>
            <p className="text-[#6b7280] text-lg max-w-xl mx-auto">
              Three simple steps. Fully automated from day one.
            </p>
          </div>

          <div className="relative">
            {/* Dashed connector line (desktop) */}
            <div className="hidden md:block absolute top-16 left-[calc(16.66%+1.5rem)] right-[calc(16.66%+1.5rem)] h-px border-t-2 border-dashed border-[#2a2d3e]" />

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  step: "01",
                  icon: <Search className="w-7 h-7 text-[#4fc3f7]" />,
                  title: "Connect Your Tools",
                  desc: "Link Apollo.io for lead sourcing, Atlas AI for calling, and Google Calendar for booking. Our guided setup takes under 30 minutes.",
                  tags: ["Apollo", "Atlas", "Google Calendar"],
                },
                {
                  step: "02",
                  icon: <MapPin className="w-7 h-7 text-[#00ff88]" />,
                  title: "Set Your Targets",
                  desc: "Choose the industries and locations you want to target. LeadEmm learns your ideal customer profile and starts hunting.",
                  tags: ["Industry", "Location", "ICP"],
                },
                {
                  step: "03",
                  icon: <Calendar className="w-7 h-7 text-[#00ff88]" />,
                  title: "Watch Bookings Roll In",
                  desc: "Sit back while LeadEmm fills your calendar. Every appointment lands in Google Calendar with full prospect details.",
                  tags: ["Auto-booking", "24/7", "Google Cal"],
                },
              ].map((item, i) => (
                <div key={i} className="flex flex-col items-center text-center">
                  <div className="relative mb-5">
                    <div className="w-14 h-14 rounded-2xl bg-[#1a1d2e] border border-[#2a2d3e] flex items-center justify-center">
                      {item.icon}
                    </div>
                    <span className="absolute -top-2 -right-2 text-xs font-black text-[#00ff88] bg-[#0f1117] border border-[#00ff88]/30 rounded-full w-6 h-6 flex items-center justify-center">
                      {item.step.slice(-1)}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                  <p className="text-sm text-[#6b7280] leading-relaxed mb-4">{item.desc}</p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs bg-[#1a1d2e] border border-[#2a2d3e] rounded-full px-3 py-1 text-[#6b7280]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────────── */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-[#1a1d2e]/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black mb-4">
              Everything on <span className="text-[#00ff88]">LeadEmm</span>
            </h2>
            <p className="text-[#6b7280] text-lg max-w-xl mx-auto">
              From lead discovery to signed appointment — fully automated.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: <Search className="w-6 h-6 text-[#4fc3f7]" />,
                title: "Pull Leads",
                desc: "Apollo.io searches your target industries and locations automatically, surfacing verified contacts ready to be called.",
                accent: "#4fc3f7",
              },
              {
                icon: <Phone className="w-6 h-6 text-[#00ff88]" />,
                title: "Call Automatically",
                desc: "Atlas AI calls every lead with a natural, human-sounding voice — qualifying prospects and handling objections 24/7.",
                accent: "#00ff88",
              },
              {
                icon: <Calendar className="w-6 h-6 text-[#00ff88]" />,
                title: "Book Instantly",
                desc: "Confirmed appointments land directly in your Google Calendar with full contact details. Zero manual work required.",
                accent: "#00ff88",
              },
            ].map((card, i) => (
              <div
                key={i}
                className={cn(
                  "group relative bg-[#1a1d2e] border border-[#2a2d3e] rounded-2xl p-6 overflow-hidden",
                  "hover:border-[#00ff88]/30 transition-all duration-300 cursor-default"
                )}
              >
                {/* Hover glow */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{
                    background: `radial-gradient(ellipse at top left, ${card.accent}08 0%, transparent 70%)`,
                  }}
                />
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 border"
                  style={{
                    background: `${card.accent}15`,
                    borderColor: `${card.accent}30`,
                  }}
                >
                  {card.icon}
                </div>
                <h3 className="font-bold text-lg mb-2">{card.title}</h3>
                <p className="text-sm text-[#6b7280] leading-relaxed">{card.desc}</p>
                {/* Bottom accent bar */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: card.accent }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF ─────────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
            {[
              { icon: <Users className="w-5 h-5" />, value: "500+", label: "Businesses" },
              { icon: <DollarSign className="w-5 h-5" />, value: "$2.3M", label: "Jobs Booked" },
              { icon: <TrendingUp className="w-5 h-5" />, value: "94%", label: "Booking Rate" },
              { icon: <Clock className="w-5 h-5" />, value: "24/7", label: "Operation" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl p-5 text-center"
              >
                <div className="flex justify-center mb-2 text-[#00ff88]">{stat.icon}</div>
                <p className="text-2xl font-black text-white mb-1">{stat.value}</p>
                <p className="text-xs text-[#6b7280] uppercase tracking-wide">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Testimonials */}
          <div className="text-center mb-10">
            <p className="text-[#6b7280] text-sm uppercase tracking-widest font-semibold">
              Paying for itself in the first week
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-2xl p-6 flex flex-col"
              >
                <div className="flex mb-4">
                  {[...Array(t.stars)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-sm text-[#6b7280] leading-relaxed flex-1 mb-5">
                  &ldquo;{t.body}&rdquo;
                </p>
                <div>
                  <p className="text-sm font-bold text-white">{t.name}</p>
                  <p className="text-xs text-[#6b7280]">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING PREVIEW ──────────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-[#1a1d2e]/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Simple, transparent pricing</h2>
            <p className="text-[#6b7280] text-lg">
              $400 one-time setup fee + monthly subscription. No contracts.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-10">
            {[
              {
                name: "Starter",
                price: "$297",
                period: "/mo",
                desc: "Perfect for solo operators just getting started.",
                features: ["50 leads/month", "AI voice calls via Atlas", "Google Calendar booking", "Basic dashboard", "1 user seat"],
                popular: false,
                cta: "Get Started",
              },
              {
                name: "Growth",
                price: "$497",
                period: "/mo",
                desc: "For growing teams that want more leads and customization.",
                features: ["150 leads/month", "Everything in Starter", "SMS notifications", "Custom call scripts", "3 user seats", "3 targets"],
                popular: true,
                cta: "Get Started",
              },
              {
                name: "Pro",
                price: "$797",
                period: "/mo",
                desc: "Unlimited power for established service businesses.",
                features: ["Unlimited leads", "Everything in Growth", "Dedicated support", "API access", "Unlimited seats", "Monthly strategy call"],
                popular: false,
                cta: "Get Started",
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  "relative bg-[#1a1d2e] border rounded-2xl p-6 flex flex-col",
                  plan.popular
                    ? "border-[#00ff88]/50 shadow-[0_0_30px_rgba(0,255,136,0.1)]"
                    : "border-[#2a2d3e]"
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-[#00ff88] text-[#0f1117] text-xs font-black px-4 py-1 rounded-full uppercase tracking-wide">
                      Most Popular
                    </span>
                  </div>
                )}
                <h3 className="font-bold text-lg mb-1">{plan.name}</h3>
                <div className="flex items-end gap-1 mb-2">
                  <span className="text-3xl font-black text-[#00ff88]">{plan.price}</span>
                  <span className="text-[#6b7280] text-sm mb-1">{plan.period}</span>
                </div>
                <p className="text-sm text-[#6b7280] mb-5">{plan.desc}</p>
                <ul className="space-y-2 flex-1 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-[#6b7280]">
                      <CheckCircle className="w-4 h-4 text-[#00ff88] shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/pricing"
                  className={cn(
                    "text-sm font-bold py-2.5 rounded-xl text-center transition-colors",
                    plan.popular
                      ? "bg-[#00ff88] text-[#0f1117] hover:bg-[#00ff88]/90"
                      : "border border-[#2a2d3e] text-white hover:border-[#00ff88]/30"
                  )}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1.5 text-[#4fc3f7] hover:text-[#4fc3f7]/80 text-sm font-semibold transition-colors"
            >
              View Full Pricing <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── DEMO BANNER ──────────────────────────────────────────────────────── */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="relative overflow-hidden bg-gradient-to-r from-[#00ff88]/20 via-[#00ff88]/10 to-[#4fc3f7]/10 border border-[#00ff88]/30 rounded-2xl px-8 py-10 text-center">
            <div className="absolute inset-0 bg-[#0f1117]/40" />
            <div className="relative">
              <p className="text-xs text-[#00ff88] font-semibold uppercase tracking-widest mb-3">
                No sign-up required
              </p>
              <h2 className="text-2xl sm:text-3xl font-black mb-3">
                See LeadEmm in action
              </h2>
              <p className="text-[#6b7280] text-sm mb-6 max-w-md mx-auto">
                Explore a live demo dashboard with real simulated data. No credit card needed.
              </p>
              <Link
                href="/dashboard?demo=true"
                className="inline-flex items-center gap-2 bg-[#00ff88] text-[#0f1117] font-bold px-7 py-3 rounded-xl hover:bg-[#00ff88]/90 transition-colors"
              >
                <Play className="w-4 h-4" />
                Preview Demo Dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────────── */}
      <section id="faq" className="py-20 px-4 sm:px-6 lg:px-8 bg-[#1a1d2e]/30">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Frequently Asked Questions</h2>
            <p className="text-[#6b7280]">Everything you need to know about LeadEmm.</p>
          </div>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-4xl sm:text-5xl font-black mb-6 leading-tight">
            Stop chasing leads.{" "}
            <span className="text-[#00ff88]">Start booking jobs.</span>
          </h2>
          <p className="text-[#6b7280] text-lg mb-8">
            Join 500+ service businesses running on LeadEmm.
          </p>
          <Link
            href="#"
            className="inline-flex items-center gap-2 bg-[#00ff88] text-[#0f1117] font-black text-lg px-10 py-4 rounded-xl hover:bg-[#00ff88]/90 transition-colors"
          >
            Start Your Free Trial <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="text-xs text-[#6b7280] mt-4">
            $400 one-time setup fee. Cancel anytime.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
