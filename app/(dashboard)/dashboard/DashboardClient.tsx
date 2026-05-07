"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Users,
  Phone,
  Calendar,
  DollarSign,
  Video,
  Zap,
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import StatsCard from "@/components/dashboard/StatsCard";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import KanbanBoard from "@/components/dashboard/KanbanBoard";
import { cn, formatCurrency } from "@/lib/utils";
import type { Booking, Lead } from "@/lib/types";
import type { Activity, ActivityType } from "@/components/dashboard/ActivityFeed";
import type { KanbanLeads } from "@/components/dashboard/KanbanBoard";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  leadsToday: number;
  leadsChange: number;
  callsToday: number;
  callsChange: number;
  bookingsThisWeek: number;
  bookingsChange: number;
  estimatedRevenue: number;
  revenueChange: number;
  leadsSparkline: number[];
  callsSparkline: number[];
  bookingsSparkline: number[];
  revenueSparkline: number[];
}

interface BookingWithMeta extends Booking {
  businessName: string;
  industry: string;
}

interface DashboardClientProps {
  firstName: string;
  isDemo: boolean;
  stats: DashboardStats;
  todaysBookings: BookingWithMeta[];
  activities: Activity[];
  kanbanLeads: KanbanLeads;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function BookingStatusBadge({ status }: { status: Booking["status"] }) {
  const map: Record<Booking["status"], { label: string; cls: string }> = {
    confirmed: {
      label: "Confirmed",
      cls: "bg-[rgba(0,255,136,0.1)] text-[#00ff88]",
    },
    cancelled: {
      label: "Cancelled",
      cls: "bg-[rgba(255,77,79,0.1)] text-red-400",
    },
    rescheduled: {
      label: "Rescheduled",
      cls: "bg-[rgba(251,191,36,0.1)] text-yellow-400",
    },
    completed: {
      label: "Completed",
      cls: "bg-[rgba(79,195,247,0.1)] text-[#4fc3f7]",
    },
    no_show: {
      label: "No Show",
      cls: "bg-[rgba(107,114,128,0.1)] text-[#6b7280]",
    },
  };
  const { label, cls } = map[status] ?? map.confirmed;
  return (
    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", cls)}>
      {label}
    </span>
  );
}

// ─── Greeting ─────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardClient({
  firstName,
  isDemo,
  stats,
  todaysBookings,
  activities,
  kanbanLeads,
}: DashboardClientProps) {
  const [pullingLeads, setPullingLeads] = useState(false);
  const [triggeringCalls, setTriggeringCalls] = useState(false);

  async function handlePullLeads() {
    if (isDemo) {
      toast.success("Demo mode: leads pulled! Connect your account to use real data.");
      return;
    }
    setPullingLeads(true);
    try {
      const res = await fetch("/api/leads/pull", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Leads pulled successfully!");
    } catch {
      toast.error("Failed to pull leads. Please try again.");
    } finally {
      setPullingLeads(false);
    }
  }

  async function handleTriggerCalls() {
    if (isDemo) {
      toast.success("Demo mode: calls queued! Connect your account to use real data.");
      return;
    }
    setTriggeringCalls(true);
    try {
      const res = await fetch("/api/calls/trigger", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Call campaign triggered!");
    } catch {
      toast.error("Failed to trigger calls. Please try again.");
    } finally {
      setTriggeringCalls(false);
    }
  }

  return (
    <div className="p-6 space-y-8 max-w-[1600px]">
      {/* Demo banner */}
      {isDemo && (
        <div className="flex items-center gap-3 rounded-xl border border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.06)] px-4 py-3">
          <AlertCircle className="h-4 w-4 text-yellow-400 flex-shrink-0" />
          <p className="text-sm text-yellow-400 font-medium">
            You&apos;re viewing a demo.{" "}
            <Link
              href="/signup"
              className="underline underline-offset-2 hover:text-yellow-300 transition-colors"
            >
              Sign up to connect your real data.
            </Link>
          </p>
        </div>
      )}

      {/* Welcome banner */}
      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d2e] px-6 py-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl font-bold text-white">
                {getGreeting()}, {firstName}! 👋
              </span>
            </div>
            <p className="text-sm text-[#6b7280]">
              Here&apos;s what LeadEmm did while you were away.
            </p>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[rgba(0,255,136,0.2)] bg-[rgba(0,255,136,0.05)]">
            <span className="h-2 w-2 rounded-full bg-[#00ff88] animate-pulse-green" />
            <span className="text-xs font-semibold text-[#00ff88]">Live</span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard
          title="Leads Today"
          value={stats.leadsToday}
          change={stats.leadsChange}
          icon={Users}
          color="blue"
          sparklineData={stats.leadsSparkline}
        />
        <StatsCard
          title="Calls Made Today"
          value={stats.callsToday}
          change={stats.callsChange}
          icon={Phone}
          color="green"
          sparklineData={stats.callsSparkline}
        />
        <StatsCard
          title="Bookings This Week"
          value={stats.bookingsThisWeek}
          change={stats.bookingsChange}
          icon={Calendar}
          color="purple"
          sparklineData={stats.bookingsSparkline}
        />
        <StatsCard
          title="Est. Revenue Saved"
          value={formatCurrency(stats.estimatedRevenue)}
          change={stats.revenueChange}
          changeLabel="vs last week"
          icon={DollarSign}
          color="gold"
          sparklineData={stats.revenueSparkline}
        />
      </div>

      {/* Today's Bookings + Quick Actions */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Today's Bookings */}
        <div className="xl:col-span-2 rounded-xl border border-[#2a2d3e] bg-[#1a1d2e] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">
              Today&apos;s Bookings
            </h2>
            <Link
              href="/bookings"
              className="text-xs text-[#00ff88] hover:text-[#00ff88]/80 transition-colors font-medium"
            >
              View all
            </Link>
          </div>

          {todaysBookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="h-12 w-12 rounded-full bg-[rgba(0,255,136,0.08)] flex items-center justify-center mb-3">
                <Zap className="h-5 w-5 text-[#00ff88]" />
              </div>
              <p className="text-sm font-medium text-white">
                No bookings today yet.
              </p>
              <p className="text-xs text-[#6b7280] mt-1">
                LeadEmm is working on it! 🤖
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {todaysBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center gap-4 rounded-lg border border-[#2a2d3e] bg-[#0f1117] p-3 hover:border-[#3a3d4e] hover:bg-[#13161f] transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-white truncate">
                        {booking.businessName}
                      </p>
                      <span className="text-[10px] bg-[rgba(79,195,247,0.1)] text-[#4fc3f7] px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                        {booking.industry}
                      </span>
                    </div>
                    <p className="text-xs text-[#6b7280] mt-0.5">
                      {new Date(booking.scheduled_at).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      · {booking.duration_minutes}min
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <BookingStatusBadge status={booking.status} />
                    {booking.meet_link && (
                      <a
                        href={booking.meet_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-lg bg-[rgba(0,255,136,0.1)] border border-[rgba(0,255,136,0.2)] px-3 py-1.5 text-[11px] font-semibold text-[#00ff88] hover:bg-[rgba(0,255,136,0.15)] transition-colors"
                      >
                        <Video className="h-3 w-3" />
                        Join
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d2e] p-5 flex-1">
            <h2 className="text-sm font-semibold text-white mb-4">
              Quick Actions
            </h2>
            <div className="space-y-3">
              <button
                onClick={handlePullLeads}
                disabled={pullingLeads}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[rgba(79,195,247,0.1)] border border-[rgba(79,195,247,0.2)] px-4 py-3.5 text-sm font-semibold text-[#4fc3f7] hover:bg-[rgba(79,195,247,0.15)] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                {pullingLeads ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Users className="h-4 w-4" />
                )}
                {pullingLeads ? "Pulling Leads..." : "Pull Leads Now"}
              </button>

              <button
                onClick={handleTriggerCalls}
                disabled={triggeringCalls}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[rgba(0,255,136,0.1)] border border-[rgba(0,255,136,0.2)] px-4 py-3.5 text-sm font-semibold text-[#00ff88] hover:bg-[rgba(0,255,136,0.15)] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                {triggeringCalls ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {triggeringCalls ? "Triggering..." : "Trigger Calls Now"}
              </button>
            </div>

            {/* Mini stats */}
            <div className="mt-5 pt-4 border-t border-[#2a2d3e] space-y-2.5">
              {[
                {
                  label: "Calls in queue",
                  value: isDemo ? "14" : "—",
                  icon: Phone,
                  color: "text-[#00ff88]",
                },
                {
                  label: "Leads awaiting call",
                  value: isDemo ? "31" : "—",
                  icon: Users,
                  color: "text-[#4fc3f7]",
                },
                {
                  label: "Active targets",
                  value: isDemo ? "3" : "—",
                  icon: Zap,
                  color: "text-yellow-400",
                },
              ].map(({ label, value, icon: Icon, color }) => (
                <div
                  key={label}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-3.5 w-3.5", color)} />
                    <span className="text-xs text-[#6b7280]">{label}</span>
                  </div>
                  <span className="text-xs font-semibold text-white">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Live Activity Feed */}
      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d2e] p-5">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-sm font-semibold text-white">Activity Feed</h2>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[rgba(0,255,136,0.08)] border border-[rgba(0,255,136,0.15)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#00ff88] animate-pulse-green" />
            <span className="text-[10px] font-semibold text-[#00ff88]">Live</span>
          </div>
        </div>
        <ActivityFeed activities={activities} isDemo={isDemo} />
      </div>

      {/* Lead Pipeline Kanban */}
      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d2e] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Lead Pipeline</h2>
          <Link
            href="/leads"
            className="text-xs text-[#00ff88] hover:text-[#00ff88]/80 transition-colors font-medium"
          >
            Manage all leads
          </Link>
        </div>
        <KanbanBoard leads={kanbanLeads} />
      </div>
    </div>
  );
}
