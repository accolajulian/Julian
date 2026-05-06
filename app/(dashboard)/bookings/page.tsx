"use client";

import { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Video,
  X,
  Calendar,
  Clock,
  Tag,
  AlertTriangle,
  Bot,
  CheckCircle,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Booking } from "@/lib/types";

// ─── Demo data ────────────────────────────────────────────────────────────────

interface DemoBooking extends Booking {
  businessName: string;
  industry: string;
}

const NOW = new Date("2026-05-06T12:00:00Z");

function makeBooking(
  id: string,
  businessName: string,
  industry: string,
  daysOffset: number,
  hour: number,
  status: Booking["status"],
  hasMeet: boolean
): DemoBooking {
  const d = new Date(NOW);
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hour, 0, 0, 0);
  return {
    id,
    organization_id: "demo",
    lead_id: `lead-${id}`,
    call_id: null,
    target_id: null,
    calendar_event_id: `evt-${id}`,
    calendar_provider: "google",
    title: `Consultation with ${businessName}`,
    description: `Discovery call to discuss AI-powered lead generation for ${businessName}.`,
    scheduled_at: d.toISOString(),
    duration_minutes: 30,
    timezone: "America/New_York",
    meet_link: hasMeet ? `https://meet.google.com/jac-${id.padStart(4, "0")}-xyz` : null,
    status,
    cancelled_at: null,
    cancellation_reason: null,
    created_at: new Date(NOW.getTime() - 3 * 86400000).toISOString(),
    updated_at: NOW.toISOString(),
    businessName,
    industry,
  };
}

const DEMO_BOOKINGS: DemoBooking[] = [
  makeBooking("b1", "Sunrise Plumbing", "Plumbing", 0, 10, "confirmed", true),
  makeBooking("b2", "Blue Ridge HVAC", "HVAC", 1, 14, "confirmed", true),
  makeBooking("b3", "Apex Electric", "Electrician", 3, 9, "confirmed", true),
  makeBooking("b4", "Pinnacle Roofing", "Roofing", 5, 11, "rescheduled", false),
  makeBooking("b5", "Green Lawn Care", "Landscaping", 8, 15, "confirmed", true),
  makeBooking("b6", "Iron Gate Fencing", "Fencing", 12, 10, "confirmed", true),
  makeBooking("b7", "Mountain Air Heating", "HVAC", -5, 13, "completed", true),
  makeBooking("b8", "Gulf Coast Pest", "Pest Control", -10, 9, "completed", false),
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

function fmtMonthYear(year: number, month: number): string {
  return new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function statusConfig(status: Booking["status"]) {
  switch (status) {
    case "confirmed":
      return { label: "Confirmed", icon: CheckCircle, classes: "bg-[#00ff88]/20 text-[#00ff88] border-[#00ff88]/30" };
    case "rescheduled":
      return { label: "Rescheduled", icon: RefreshCw, classes: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" };
    case "completed":
      return { label: "Completed", icon: CheckCircle, classes: "bg-gray-500/20 text-gray-400 border-gray-500/30" };
    case "cancelled":
      return { label: "Cancelled", icon: XCircle, classes: "bg-red-500/20 text-red-400 border-red-500/30" };
    case "no_show":
      return { label: "No Show", icon: XCircle, classes: "bg-orange-500/20 text-orange-400 border-orange-500/30" };
  }
}

function StatusBadge({ status }: { status: Booking["status"] }) {
  const cfg = statusConfig(status);
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", cfg.classes)}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

// ─── Cancel confirmation modal ────────────────────────────────────────────────

function CancelModal({
  booking,
  onCancel,
  onClose,
}: {
  booking: DemoBooking;
  onCancel: (id: string) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    await fetch(`/api/bookings/${booking.id}`, { method: "DELETE" }).catch(() => {});
    onCancel(booking.id);
    setLoading(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Cancel Booking</h3>
            <p className="text-xs text-[#6b7280]">This cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-[#9ca3af] mb-6">
          Are you sure you want to cancel the booking with{" "}
          <span className="font-semibold text-white">{booking.businessName}</span> on{" "}
          {fmtDate(booking.scheduled_at)} at {fmtTime(booking.scheduled_at)}?
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-[#2a2d3e] text-sm text-[#9ca3af] hover:text-white hover:border-[#6b7280] transition-colors"
          >
            Keep Booking
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg bg-red-500/80 hover:bg-red-500 text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {loading ? "Cancelling…" : "Cancel Booking"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Booking detail modal ─────────────────────────────────────────────────────

function BookingDetailModal({
  booking,
  onClose,
  onCancelRequest,
}: {
  booking: DemoBooking;
  onClose: () => void;
  onCancelRequest: (b: DemoBooking) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-white">{booking.businessName}</h2>
            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs bg-[#4fc3f7]/10 text-[#4fc3f7] border border-[#4fc3f7]/20">
              <Tag className="w-3 h-3" /> {booking.industry}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#2a2d3e] text-[#6b7280] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-[#6b7280]" />
            <span className="text-sm text-[#9ca3af]">{fmtDate(booking.scheduled_at)}</span>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-[#6b7280]" />
            <span className="text-sm text-[#9ca3af]">
              {fmtTime(booking.scheduled_at)} · {booking.duration_minutes} min
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-4 h-4 flex items-center justify-center"><StatusBadge status={booking.status} /></span>
          </div>
          {booking.description && (
            <p className="text-sm text-[#9ca3af] border-t border-[#2a2d3e] pt-3">{booking.description}</p>
          )}
        </div>

        <div className="flex gap-3">
          {booking.meet_link && (
            <a
              href={booking.meet_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#4fc3f7]/10 border border-[#4fc3f7]/30 text-[#4fc3f7] text-sm font-medium hover:bg-[#4fc3f7]/20 transition-colors"
            >
              <Video className="w-4 h-4" /> Join Meet
            </a>
          )}
          {(booking.status === "confirmed" || booking.status === "rescheduled") && (
            <button
              onClick={() => { onClose(); onCancelRequest(booking); }}
              className="flex-1 py-2.5 rounded-lg border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Calendar view ─────────────────────────────────────────────────────────────

type CalendarMode = "monthly" | "weekly" | "daily";

function CalendarView({
  bookings,
  onSelectBooking,
}: {
  bookings: DemoBooking[];
  onSelectBooking: (b: DemoBooking) => void;
}) {
  const today = new Date(NOW);
  const [viewDate, setViewDate] = useState(new Date(NOW.getFullYear(), NOW.getMonth(), 1));
  const [mode, setMode] = useState<CalendarMode>("monthly");

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Build calendar grid for monthly view
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstDayOfMonth + daysInMonth) / 7) * 7;

  function bookingsOnDay(day: number): DemoBooking[] {
    return bookings.filter((b) => {
      const d = new Date(b.scheduled_at);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
  }

  function goBack() {
    if (mode === "monthly") {
      setViewDate(new Date(year, month - 1, 1));
    } else if (mode === "weekly") {
      setViewDate(new Date(viewDate.getTime() - 7 * 86400000));
    } else {
      setViewDate(new Date(viewDate.getTime() - 86400000));
    }
  }

  function goForward() {
    if (mode === "monthly") {
      setViewDate(new Date(year, month + 1, 1));
    } else if (mode === "weekly") {
      setViewDate(new Date(viewDate.getTime() + 7 * 86400000));
    } else {
      setViewDate(new Date(viewDate.getTime() + 86400000));
    }
  }

  return (
    <div>
      {/* Calendar controls */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <button
            onClick={goBack}
            className="p-1.5 rounded-lg hover:bg-[#2a2d3e] text-[#6b7280] hover:text-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h3 className="text-base font-bold text-white min-w-[180px] text-center">
            {mode === "monthly"
              ? fmtMonthYear(year, month)
              : mode === "weekly"
              ? `Week of ${viewDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
              : viewDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </h3>
          <button
            onClick={goForward}
            className="p-1.5 rounded-lg hover:bg-[#2a2d3e] text-[#6b7280] hover:text-white transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <div className="flex rounded-lg border border-[#2a2d3e] overflow-hidden">
          {(["monthly", "weekly", "daily"] as CalendarMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                mode === m
                  ? "bg-[#00ff88] text-[#0f1117]"
                  : "bg-[#1a1d2e] text-[#6b7280] hover:text-white"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Monthly grid */}
      {mode === "monthly" && (
        <div className="rounded-xl border border-[#2a2d3e] overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-[#2a2d3e]">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="px-2 py-2 text-center text-xs font-semibold text-[#6b7280] bg-[#1a1d2e]">
                {d}
              </div>
            ))}
          </div>
          {/* Day cells */}
          <div className="grid grid-cols-7">
            {Array.from({ length: totalCells }).map((_, idx) => {
              const dayNum = idx - firstDayOfMonth + 1;
              const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
              const isToday = inMonth && dayNum === today.getDate() && month === today.getMonth() && year === today.getFullYear();
              const dayBookings = inMonth ? bookingsOnDay(dayNum) : [];

              return (
                <div
                  key={idx}
                  className={cn(
                    "min-h-[90px] p-1.5 border-b border-r border-[#2a2d3e] last:border-r-0",
                    !inMonth && "bg-[#0f1117]/50",
                    isToday && "bg-[#00ff88]/5"
                  )}
                >
                  {inMonth && (
                    <>
                      <span className={cn(
                        "inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-medium mb-1",
                        isToday ? "bg-[#00ff88] text-[#0f1117] font-bold" : "text-[#9ca3af]"
                      )}>
                        {dayNum}
                      </span>
                      <div className="space-y-0.5">
                        {dayBookings.slice(0, 2).map((b) => (
                          <button
                            key={b.id}
                            onClick={() => onSelectBooking(b)}
                            className={cn(
                              "w-full text-left truncate px-1.5 py-0.5 rounded text-xs font-medium transition-colors",
                              b.status === "cancelled"
                                ? "bg-red-500/10 text-red-400 line-through"
                                : "bg-[#00ff88]/15 text-[#00ff88] hover:bg-[#00ff88]/25"
                            )}
                          >
                            {fmtTime(b.scheduled_at)} {b.businessName}
                          </button>
                        ))}
                        {dayBookings.length > 2 && (
                          <span className="text-xs text-[#6b7280] px-1">+{dayBookings.length - 2} more</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weekly view */}
      {mode === "weekly" && (
        <div className="rounded-xl border border-[#2a2d3e] overflow-hidden">
          <div className="grid grid-cols-7 border-b border-[#2a2d3e]">
            {Array.from({ length: 7 }).map((_, i) => {
              const d = new Date(viewDate.getTime() + i * 86400000);
              const isT = d.toDateString() === today.toDateString();
              return (
                <div key={i} className={cn("px-2 py-3 text-center bg-[#1a1d2e]", isT && "border-b-2 border-[#00ff88]")}>
                  <p className="text-xs text-[#6b7280]">{d.toLocaleDateString("en-US", { weekday: "short" })}</p>
                  <p className={cn("text-sm font-bold", isT ? "text-[#00ff88]" : "text-white")}>{d.getDate()}</p>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-7 min-h-[200px]">
            {Array.from({ length: 7 }).map((_, i) => {
              const d = new Date(viewDate.getTime() + i * 86400000);
              const dayBookings = bookings.filter((b) => new Date(b.scheduled_at).toDateString() === d.toDateString());
              return (
                <div key={i} className="p-2 border-r border-[#2a2d3e] last:border-r-0 space-y-1">
                  {dayBookings.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => onSelectBooking(b)}
                      className="w-full text-left p-2 rounded-lg bg-[#00ff88]/10 border border-[#00ff88]/20 hover:bg-[#00ff88]/20 transition-colors"
                    >
                      <p className="text-xs font-semibold text-[#00ff88] truncate">{b.businessName}</p>
                      <p className="text-xs text-[#9ca3af]">{fmtTime(b.scheduled_at)}</p>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Daily view */}
      {mode === "daily" && (() => {
        const dayBookings = bookings
          .filter((b) => new Date(b.scheduled_at).toDateString() === viewDate.toDateString())
          .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
        return (
          <div className="rounded-xl border border-[#2a2d3e] overflow-hidden">
            {dayBookings.length === 0 ? (
              <div className="py-16 text-center text-[#6b7280] text-sm">
                No bookings on this day.
              </div>
            ) : (
              <div className="divide-y divide-[#2a2d3e]">
                {dayBookings.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => onSelectBooking(b)}
                    className="w-full flex items-center gap-4 p-4 hover:bg-[#1a1d2e] transition-colors"
                  >
                    <div className="text-center min-w-[60px]">
                      <p className="text-sm font-bold text-[#00ff88]">{fmtTime(b.scheduled_at)}</p>
                      <p className="text-xs text-[#6b7280]">{b.duration_minutes}m</p>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-semibold text-white">{b.businessName}</p>
                      <p className="text-xs text-[#6b7280]">{b.industry}</p>
                    </div>
                    <StatusBadge status={b.status} />
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── List view ─────────────────────────────────────────────────────────────────

function ListView({
  bookings,
  onSelectBooking,
  onCancelRequest,
}: {
  bookings: DemoBooking[];
  onSelectBooking: (b: DemoBooking) => void;
  onCancelRequest: (b: DemoBooking) => void;
}) {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const nowIso = NOW.toISOString();
  const upcoming = bookings.filter(
    (b) => b.scheduled_at >= nowIso && b.status !== "cancelled"
  ).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const past = bookings.filter(
    (b) => b.scheduled_at < nowIso || b.status === "cancelled" || b.status === "completed"
  ).sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));

  const items = tab === "upcoming" ? upcoming : past;

  if (bookings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Bot className="w-14 h-14 text-[#00ff88] opacity-60" />
        <p className="text-lg font-semibold text-white">No bookings yet. AutoPilot is working on it! 🤖</p>
        <p className="text-sm text-[#6b7280]">We'll notify you the moment a booking lands.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex rounded-lg border border-[#2a2d3e] overflow-hidden mb-5 w-fit">
        {(["upcoming", "past"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-5 py-2 text-sm font-medium capitalize transition-colors",
              tab === t ? "bg-[#00ff88] text-[#0f1117]" : "bg-[#1a1d2e] text-[#6b7280] hover:text-white"
            )}
          >
            {t} {t === "upcoming" ? `(${upcoming.length})` : `(${past.length})`}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-[#6b7280] text-sm">
            {tab === "upcoming" ? "No upcoming bookings." : "No past bookings."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-4 p-4 rounded-xl bg-[#1a1d2e] border border-[#2a2d3e] hover:border-[#00ff88]/30 transition-colors cursor-pointer"
              onClick={() => onSelectBooking(b)}
            >
              {/* Date block */}
              <div className="flex-shrink-0 w-14 text-center rounded-lg bg-[#0f1117] p-2">
                <p className="text-xs text-[#6b7280]">
                  {new Date(b.scheduled_at).toLocaleDateString("en-US", { month: "short" })}
                </p>
                <p className="text-xl font-bold text-white leading-none">
                  {new Date(b.scheduled_at).getDate()}
                </p>
                <p className="text-xs text-[#6b7280]">{fmtTime(b.scheduled_at)}</p>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{b.businessName}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-[#6b7280]">{b.duration_minutes}m</span>
                  <span className="text-[#2a2d3e]">·</span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs bg-[#4fc3f7]/10 text-[#4fc3f7] border border-[#4fc3f7]/20">
                    <Tag className="w-3 h-3" /> {b.industry}
                  </span>
                </div>
              </div>

              {/* Status + actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <StatusBadge status={b.status} />
                {b.meet_link && (
                  <a
                    href={b.meet_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#4fc3f7]/10 border border-[#4fc3f7]/20 text-[#4fc3f7] text-xs font-medium hover:bg-[#4fc3f7]/20 transition-colors"
                  >
                    <Video className="w-3.5 h-3.5" /> Meet
                  </a>
                )}
                {(b.status === "confirmed" || b.status === "rescheduled") && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onCancelRequest(b); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/10 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function BookingsPage() {
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [bookings, setBookings] = useState<DemoBooking[]>(DEMO_BOOKINGS);
  const [selectedBooking, setSelectedBooking] = useState<DemoBooking | null>(null);
  const [cancelTarget, setCancelTarget] = useState<DemoBooking | null>(null);

  function handleCancel(id: string) {
    setBookings((prev) =>
      prev.map((b) => b.id === id ? { ...b, status: "cancelled" as const, cancelled_at: new Date().toISOString() } : b)
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Bookings</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">
            {bookings.filter((b) => b.status !== "cancelled" && new Date(b.scheduled_at) >= NOW).length} upcoming
          </p>
        </div>
        <div className="flex rounded-lg border border-[#2a2d3e] overflow-hidden">
          <button
            onClick={() => setView("calendar")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
              view === "calendar" ? "bg-[#00ff88] text-[#0f1117]" : "bg-[#1a1d2e] text-[#6b7280] hover:text-white"
            )}
          >
            <Calendar className="w-4 h-4" /> Calendar View
          </button>
          <button
            onClick={() => setView("list")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
              view === "list" ? "bg-[#00ff88] text-[#0f1117]" : "bg-[#1a1d2e] text-[#6b7280] hover:text-white"
            )}
          >
            <Clock className="w-4 h-4" /> List View
          </button>
        </div>
      </div>

      {/* View */}
      {view === "calendar" ? (
        <CalendarView bookings={bookings} onSelectBooking={setSelectedBooking} />
      ) : (
        <ListView
          bookings={bookings}
          onSelectBooking={setSelectedBooking}
          onCancelRequest={setCancelTarget}
        />
      )}

      {/* Modals */}
      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onCancelRequest={(b) => { setSelectedBooking(null); setCancelTarget(b); }}
        />
      )}
      {cancelTarget && (
        <CancelModal
          booking={cancelTarget}
          onCancel={handleCancel}
          onClose={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
}
