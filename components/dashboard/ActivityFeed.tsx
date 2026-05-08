"use client";

import { useState, useEffect, useRef } from "react";
import { Phone, Users, Calendar, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActivityType = "lead" | "call" | "booking" | "system";

export interface Activity {
  id: string;
  type: ActivityType;
  message: string;
  timestamp: string; // ISO
  isNew?: boolean;
}

interface ActivityFeedProps {
  activities: Activity[];
  isDemo?: boolean;
  liveEvent?: Activity | null;
}

// ─── Icon map ─────────────────────────────────────────────────────────────────

function ActivityIcon({ type }: { type: ActivityType }) {
  switch (type) {
    case "lead":
      return (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(79,195,247,0.12)]">
          <Users className="h-3.5 w-3.5 text-[#4fc3f7]" />
        </div>
      );
    case "call":
      return (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(0,255,136,0.12)]">
          <Phone className="h-3.5 w-3.5 text-[#00ff88]" />
        </div>
      );
    case "booking":
      return (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(167,139,250,0.12)]">
          <Calendar className="h-3.5 w-3.5 text-purple-400" />
        </div>
      );
    default:
      return (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(251,191,36,0.12)]">
          <Zap className="h-3.5 w-3.5 text-yellow-400" />
        </div>
      );
  }
}

// ─── Demo event pool ──────────────────────────────────────────────────────────

const DEMO_POOL: Omit<Activity, "id" | "timestamp">[] = [
  { type: "lead", message: "Pulled 12 new leads in Tampa, FL — HVAC niche" },
  { type: "call", message: "Connected with Sunrise Plumbing — call lasted 2m 14s" },
  { type: "booking", message: "Blue Ridge HVAC booked a consultation for Thursday" },
  { type: "call", message: "Left voicemail for Pinnacle Roofing Co." },
  { type: "lead", message: "Pulled 8 new leads in Austin, TX — Electrical niche" },
  { type: "call", message: "Mountain Air Heating expressed interest — follow-up queued" },
  { type: "booking", message: "Sunrise Plumbing confirmed: Friday 10am via Google Meet" },
  { type: "call", message: "24 outbound calls completed in the last 30 minutes" },
  { type: "lead", message: "Lead limit at 68% — 32 leads remaining this month" },
  { type: "system", message: "LeadEmm resumed calling after quiet hours ended" },
];

let demoPoolIndex = 0;

function nextDemoEvent(): Activity {
  const item = DEMO_POOL[demoPoolIndex % DEMO_POOL.length];
  demoPoolIndex++;
  return {
    id: `demo-${Date.now()}-${Math.random()}`,
    type: item.type,
    message: item.message,
    timestamp: new Date().toISOString(),
    isNew: true,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ActivityFeed({
  activities: initialActivities,
  isDemo = false,
  liveEvent = null,
}: ActivityFeedProps) {
  const [items, setItems] = useState<Activity[]>(() =>
    initialActivities.slice(0, 20)
  );
  const listRef = useRef<HTMLDivElement>(null);

  // Prepend real-time events from socket
  useEffect(() => {
    if (!liveEvent) return;
    setItems((prev) => [liveEvent, ...prev].slice(0, 20));
  }, [liveEvent]);

  // In demo mode, add a fake event every 5 seconds
  useEffect(() => {
    if (!isDemo) return;
    const interval = setInterval(() => {
      const newEvent = nextDemoEvent();
      setItems((prev) => {
        const updated = [newEvent, ...prev].slice(0, 20);
        return updated;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [isDemo]);

  // Clear isNew flag after animation completes
  useEffect(() => {
    const timer = setTimeout(() => {
      setItems((prev) =>
        prev.map((item) => (item.isNew ? { ...item, isNew: false } : item))
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [items]);

  return (
    <div
      ref={listRef}
      className="flex flex-col gap-0 divide-y divide-[#2a2d3e] max-h-80 overflow-y-auto"
    >
      {items.length === 0 ? (
        <div className="py-8 text-center text-sm text-[#6b7280]">
          No activity yet. LeadEmm is warming up...
        </div>
      ) : (
        items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex items-start gap-3 py-3 px-1 transition-all duration-300",
              item.isNew && "animate-fade-in bg-[rgba(0,255,136,0.03)] rounded-lg"
            )}
          >
            <ActivityIcon type={item.type} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white leading-relaxed">{item.message}</p>
              <p className="text-[10px] text-[#6b7280] mt-0.5">
                {formatDistanceToNow(new Date(item.timestamp), {
                  addSuffix: true,
                })}
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
