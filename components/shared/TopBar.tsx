"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Bell,
  UserCircle,
  ChevronDown,
  Settings,
  CreditCard,
  LogOut,
  User,
  Calendar,
  Users,
  AlertTriangle,
  CheckCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Notification, NotificationType } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TopBarProps {
  title: string;
  notifications?: Notification[];
  unreadCount?: number;
  userName?: string;
  userEmail?: string;
  userInitial?: string;
}

// ─── Notification icon map ────────────────────────────────────────────────────

function NotifIcon({ type }: { type: NotificationType }) {
  switch (type) {
    case "booking":
      return <Calendar className="h-3.5 w-3.5 text-[#00ff88]" />;
    case "lead_interested":
      return <Users className="h-3.5 w-3.5 text-[#4fc3f7]" />;
    case "call_completed":
      return <CheckCircle className="h-3.5 w-3.5 text-purple-400" />;
    case "limit_warning":
      return <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />;
    case "billing":
      return <CreditCard className="h-3.5 w-3.5 text-[#4fc3f7]" />;
    default:
      return <Bell className="h-3.5 w-3.5 text-[#6b7280]" />;
  }
}

// ─── Demo notifications ───────────────────────────────────────────────────────

const DEMO_NOTIFICATIONS: Notification[] = [
  {
    id: "1",
    organization_id: "demo",
    user_id: null,
    type: "booking",
    title: "New booking confirmed",
    message: "Sunrise Plumbing booked a consultation for Thursday at 10am.",
    action_url: "/bookings",
    is_read: false,
    read_at: null,
    metadata: {},
    created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: "2",
    organization_id: "demo",
    user_id: null,
    type: "lead_interested",
    title: "Lead expressed interest",
    message: "Blue Ridge HVAC asked to learn more about your services.",
    action_url: "/leads",
    is_read: false,
    read_at: null,
    metadata: {},
    created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
  },
  {
    id: "3",
    organization_id: "demo",
    user_id: null,
    type: "call_completed",
    title: "Call batch completed",
    message: "LeadMey completed 24 calls in the last hour.",
    action_url: "/reports",
    is_read: true,
    read_at: null,
    metadata: {},
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: "4",
    organization_id: "demo",
    user_id: null,
    type: "limit_warning",
    title: "Lead limit approaching",
    message: "You've used 80% of your monthly lead quota.",
    action_url: "/settings",
    is_read: false,
    read_at: null,
    metadata: {},
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    id: "5",
    organization_id: "demo",
    user_id: null,
    type: "booking",
    title: "Booking rescheduled",
    message: "Mountain Roofing Co. rescheduled their call to Friday at 2pm.",
    action_url: "/bookings",
    is_read: true,
    read_at: null,
    metadata: {},
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function TopBar({
  title,
  notifications = DEMO_NOTIFICATIONS,
  unreadCount,
  userName = "Demo User",
  userEmail = "",
  userInitial = "D",
}: TopBarProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>(notifications);

  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const computedUnread =
    unreadCount ?? notifs.filter((n) => !n.is_read).length;

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function markAllRead() {
    setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  function dismissNotif(id: string) {
    setNotifs((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[#2a2d3e] bg-[#0f1117]/90 backdrop-blur-sm px-6">
      {/* Left: Page title */}
      <h1 className="text-base font-semibold text-white">{title}</h1>

      {/* Right: actions */}
      <div className="flex items-center gap-3">
        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => {
              setNotifOpen((o) => !o);
              setUserOpen(false);
            }}
            className="relative flex h-8 w-8 items-center justify-center rounded-lg text-[#6b7280] hover:bg-[#1a1d2e] hover:text-white transition-colors"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {computedUnread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#00ff88] text-[9px] font-bold text-[#0f1117]">
                {computedUnread > 9 ? "9+" : computedUnread}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-10 w-80 rounded-xl border border-[#2a2d3e] bg-[#1a1d2e] shadow-2xl shadow-black/40 animate-fade-in z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2d3e]">
                <span className="text-sm font-semibold text-white">
                  Notifications
                </span>
                {computedUnread > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-[10px] text-[#00ff88] hover:text-[#00ff88]/80 font-medium transition-colors"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="divide-y divide-[#2a2d3e] max-h-80 overflow-y-auto">
                {notifs.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-[#6b7280]">
                    No notifications
                  </div>
                ) : (
                  notifs.slice(0, 5).map((n) => (
                    <div
                      key={n.id}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 group transition-colors",
                        !n.is_read
                          ? "bg-[rgba(0,255,136,0.04)]"
                          : "hover:bg-[#1f2340]"
                      )}
                    >
                      <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#2a2d3e]">
                        <NotifIcon type={n.type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">
                          {n.title}
                        </p>
                        <p className="text-[11px] text-[#6b7280] mt-0.5 line-clamp-2">
                          {n.message}
                        </p>
                        <p className="text-[10px] text-[#6b7280]/60 mt-1">
                          {formatDistanceToNow(new Date(n.created_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {!n.is_read && (
                          <span className="h-1.5 w-1.5 rounded-full bg-[#00ff88] flex-shrink-0" />
                        )}
                        <button
                          onClick={() => dismissNotif(n.id)}
                          className="opacity-0 group-hover:opacity-100 text-[#6b7280] hover:text-white transition-all"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="px-4 py-2 border-t border-[#2a2d3e]">
                <Link
                  href="/settings"
                  onClick={() => setNotifOpen(false)}
                  className="block text-center text-[11px] text-[#6b7280] hover:text-[#00ff88] transition-colors py-1"
                >
                  View all notifications
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User dropdown */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => {
              setUserOpen((o) => !o);
              setNotifOpen(false);
            }}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[#6b7280] hover:bg-[#1a1d2e] hover:text-white transition-colors"
          >
            <div className="h-6 w-6 rounded-full bg-[rgba(0,255,136,0.2)] flex items-center justify-center text-[#00ff88] text-[10px] font-bold flex-shrink-0">
              {userInitial}
            </div>
            <span className="hidden sm:block text-xs font-medium text-white max-w-[100px] truncate">
              {userName.split(" ")[0] || "Account"}
            </span>
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                userOpen && "rotate-180"
              )}
            />
          </button>

          {userOpen && (
            <div className="absolute right-0 top-10 w-48 rounded-xl border border-[#2a2d3e] bg-[#1a1d2e] shadow-2xl shadow-black/40 animate-fade-in z-50 py-1">
              <div className="px-3 py-2 border-b border-[#2a2d3e]">
                <p className="text-xs font-semibold text-white truncate">
                  {userName}
                </p>
                <p className="text-[10px] text-[#6b7280] truncate">
                  {userEmail}
                </p>
              </div>

              {[
                { label: "Profile", icon: User, href: "/settings" },
                { label: "Settings", icon: Settings, href: "/settings" },
                { label: "Billing", icon: CreditCard, href: "/settings?tab=billing" },
              ].map(({ label, icon: Icon, href }) => (
                <Link
                  key={label}
                  href={href}
                  onClick={() => setUserOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs text-[#6b7280] hover:bg-[#1f2340] hover:text-white transition-colors"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Link>
              ))}

              <div className="border-t border-[#2a2d3e] mt-1 pt-1">
                <button
                  onClick={() => { window.location.href = "/"; }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[#6b7280] hover:bg-[rgba(255,77,79,0.08)] hover:text-red-400 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
