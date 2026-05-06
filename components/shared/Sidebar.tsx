"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Target,
  FileText,
  BarChart2,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanType } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  plan?: PlanType;
  userName?: string;
  userEmail?: string;
  userInitial?: string;
}

// ─── Nav config ───────────────────────────────────────────────────────────────

function buildNavItems(plan: PlanType): NavItem[] {
  const isStarter = plan === "starter";
  return [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Leads", href: "/leads", icon: Users },
    { label: "Bookings", href: "/bookings", icon: Calendar },
    { label: "Targets", href: "/targets", icon: Target },
    {
      label: "Scripts",
      href: "/scripts",
      icon: FileText,
      badge: isStarter ? "Growth+" : undefined,
    },
    { label: "Reports", href: "/reports", icon: BarChart2, badge: "Growth+" },
    { label: "Settings", href: "/settings", icon: Settings },
  ];
}

// ─── Plan badge colours ───────────────────────────────────────────────────────

function planBadgeClass(plan: PlanType): string {
  return cn(
    "text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide",
    plan === "starter" && "bg-[#2a2d3e] text-[#6b7280]",
    plan === "growth" && "bg-[rgba(79,195,247,0.15)] text-[#4fc3f7]",
    plan === "pro" && "bg-[rgba(0,255,136,0.15)] text-[#00ff88]"
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Sidebar({
  collapsed,
  onToggle,
  plan = "starter",
  userName = "Demo User",
  userEmail = "",
  userInitial = "D",
}: SidebarProps) {
  const pathname = usePathname();
  const navItems = buildNavItems(plan);

  function handleSignOut() {
    window.location.href = "/";
  }

  return (
    <aside
      className={cn(
        "relative flex flex-col h-screen bg-[#1a1d2e] border-r border-[#2a2d3e] transition-all duration-300 ease-in-out flex-shrink-0",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-[#1a1d2e] border border-[#2a2d3e] text-[#6b7280] hover:text-[#00ff88] hover:border-[#00ff88] transition-colors"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </button>

      {/* Logo */}
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-5 border-b border-[#2a2d3e]",
          collapsed && "justify-center px-0"
        )}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgba(0,255,136,0.15)] flex-shrink-0">
          <Zap className="h-4 w-4 text-[#00ff88]" />
        </div>
        {!collapsed && (
          <span className="font-bold text-white text-sm tracking-tight">
            AutoPilot
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-[rgba(0,255,136,0.08)] text-[#00ff88] border-l-2 border-[#00ff88] pl-[6px]"
                  : "text-[#6b7280] hover:bg-[#1f2340] hover:text-white border-l-2 border-transparent pl-[6px]",
                collapsed && "justify-center px-0 pl-0 border-l-0 rounded-lg"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon
                className={cn(
                  "h-4 w-4 flex-shrink-0",
                  isActive ? "text-[#00ff88]" : "text-[#6b7280] group-hover:text-white"
                )}
              />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[rgba(79,195,247,0.15)] text-[#4fc3f7] uppercase tracking-wide">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
              {/* Tooltip on collapsed */}
              {collapsed && (
                <div className="pointer-events-none absolute left-full ml-2 hidden rounded-md bg-[#1a1d2e] border border-[#2a2d3e] px-2.5 py-1.5 text-xs font-medium text-white shadow-lg group-hover:flex whitespace-nowrap z-50">
                  {item.label}
                  {item.badge && (
                    <span className="ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded bg-[rgba(79,195,247,0.15)] text-[#4fc3f7] uppercase">
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom user section */}
      <div className="border-t border-[#2a2d3e] p-3">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            {/* Avatar */}
            <div className="h-8 w-8 rounded-full bg-[rgba(0,255,136,0.2)] flex items-center justify-center text-[#00ff88] text-xs font-bold flex-shrink-0">
              {userInitial}
            </div>
            <button
              onClick={handleSignOut}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6b7280] hover:text-red-400 hover:bg-[rgba(255,77,79,0.08)] transition-colors"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-[rgba(0,255,136,0.2)] flex items-center justify-center text-[#00ff88] text-xs font-bold flex-shrink-0">
                {userInitial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">
                  {userName}
                </p>
                <p className="text-[10px] text-[#6b7280] truncate">
                  {userEmail}
                </p>
              </div>
              <span className={planBadgeClass(plan)}>
                {plan}
              </span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-[#6b7280] hover:text-red-400 hover:bg-[rgba(255,77,79,0.08)] transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
