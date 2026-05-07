"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/shared/Sidebar";
import TopBar from "@/components/shared/TopBar";
import type { PlanType } from "@/lib/types";

// ─── Route → page title map ───────────────────────────────────────────────────

function getPageTitle(pathname: string): string {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname.startsWith("/leads")) return "Leads";
  if (pathname.startsWith("/bookings")) return "Bookings";
  if (pathname.startsWith("/targets")) return "Targets";
  if (pathname.startsWith("/scripts")) return "Scripts";
  if (pathname.startsWith("/reports")) return "Reports";
  if (pathname.startsWith("/settings")) return "Settings";
  return "LeadEmm";
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DashboardShellProps {
  children: React.ReactNode;
  plan?: PlanType;
  userName?: string;
  userEmail?: string;
  userInitial?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardShell({
  children,
  plan = "starter",
  userName = "Demo User",
  userEmail = "",
  userInitial = "D",
}: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f1117]">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        plan={plan}
        userName={userName}
        userEmail={userEmail}
        userInitial={userInitial}
      />
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <TopBar title={title} userName={userName} userEmail={userEmail} userInitial={userInitial} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
