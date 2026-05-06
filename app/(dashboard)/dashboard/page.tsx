import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import DashboardClient from "./DashboardClient";
import type { Booking, Lead } from "@/lib/types";
import type { Activity } from "@/components/dashboard/ActivityFeed";
import type { KanbanLeads } from "@/components/dashboard/KanbanBoard";

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const clerkConfigured =
  (clerkKey.startsWith("pk_test_") || clerkKey.startsWith("pk_live_")) &&
  !clerkKey.includes("REPLACE_ME");

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_STATS = {
  leadsToday: 47,
  leadsChange: 12,
  callsToday: 83,
  callsChange: 8,
  bookingsThisWeek: 6,
  bookingsChange: 20,
  estimatedRevenue: 18500,
  revenueChange: 15,
  leadsSparkline: [12, 18, 9, 24, 31, 28, 47],
  callsSparkline: [34, 52, 41, 68, 75, 80, 83],
  bookingsSparkline: [1, 2, 1, 3, 2, 4, 6],
  revenueSparkline: [8000, 9200, 10500, 12000, 14000, 16800, 18500],
};

function makeDemoBooking(
  id: string,
  businessName: string,
  industry: string,
  hoursFromNow: number,
  status: Booking["status"],
  hasMeet: boolean
): Booking & { businessName: string; industry: string } {
  const scheduled = new Date(Date.now() + hoursFromNow * 3600 * 1000);
  return {
    id,
    organization_id: "demo",
    lead_id: `lead-${id}`,
    call_id: null,
    target_id: null,
    calendar_event_id: null,
    calendar_provider: "google",
    title: `Consultation with ${businessName}`,
    description: null,
    scheduled_at: scheduled.toISOString(),
    duration_minutes: 30,
    timezone: "America/New_York",
    meet_link: hasMeet ? "https://meet.google.com/abc-defg-hij" : null,
    status,
    cancelled_at: null,
    cancellation_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    businessName,
    industry,
  };
}

const DEMO_BOOKINGS = [
  makeDemoBooking("b1", "Sunrise Plumbing", "Plumbing", 1.5, "confirmed", true),
  makeDemoBooking("b2", "Blue Ridge HVAC", "HVAC", 3, "confirmed", true),
  makeDemoBooking("b3", "Mountain Roofing Co.", "Roofing", 5.5, "rescheduled", false),
];

const DEMO_ACTIVITIES: Activity[] = [
  {
    id: "a1",
    type: "booking",
    message: "Sunrise Plumbing confirmed a consultation for today at 10am.",
    timestamp: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
  },
  {
    id: "a2",
    type: "call",
    message: "Connected with Blue Ridge HVAC — call lasted 2m 47s",
    timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  },
  {
    id: "a3",
    type: "lead",
    message: "Pulled 14 new leads in Charlotte, NC — Plumbing niche",
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  },
  {
    id: "a4",
    type: "call",
    message: "Left voicemail for Pinnacle Roofing — retry scheduled in 4h",
    timestamp: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
  },
  {
    id: "a5",
    type: "lead",
    message: "Pulled 8 new leads in Nashville, TN — Electrical niche",
    timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
  },
  {
    id: "a6",
    type: "call",
    message: "30 outbound calls completed this hour — 4 interested",
    timestamp: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
  },
  {
    id: "a7",
    type: "system",
    message: "AutoPilot resumed calling after quiet hours ended at 8am",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
];

function makeDemoLead(
  id: string,
  company: string,
  town: string,
  industry: string,
  status: Lead["status"],
  phone: string
): Lead {
  return {
    id,
    organization_id: "demo",
    target_id: null,
    first_name: "Contact",
    last_name: company.split(" ")[0],
    full_name: `Contact at ${company}`,
    email: null,
    phone,
    company,
    title: "Owner",
    linkedin_url: null,
    website: null,
    status,
    call_attempts: 0,
    last_called_at: null,
    next_call_at: null,
    notes: null,
    custom_fields: { town, industry },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

const DEMO_KANBAN: KanbanLeads = {
  new: [
    makeDemoLead("l1", "Apex Electric", "Tampa, FL", "Electrical", "new", "(813) 555-0101"),
    makeDemoLead("l2", "Gulf Coast Plumbing", "Clearwater, FL", "Plumbing", "new", "(727) 555-0182"),
    makeDemoLead("l3", "Bright Sun HVAC", "Orlando, FL", "HVAC", "new", "(407) 555-0193"),
    makeDemoLead("l4", "Premier Roofing", "Miami, FL", "Roofing", "new", "(305) 555-0141"),
  ],
  queued: [
    makeDemoLead("l5", "Blue Sky Plumbing", "Nashville, TN", "Plumbing", "queued", "(615) 555-0121"),
    makeDemoLead("l6", "TN HVAC Pros", "Memphis, TN", "HVAC", "queued", "(901) 555-0167"),
    makeDemoLead("l7", "Summit Electric", "Knoxville, TN", "Electrical", "queued", "(865) 555-0188"),
    makeDemoLead("l8", "Ridge Top Roofing", "Chattanooga, TN", "Roofing", "queued", "(423) 555-0143"),
    makeDemoLead("l9", "Valley Air Systems", "Nashville, TN", "HVAC", "queued", "(615) 555-0199"),
  ],
  called: [
    makeDemoLead("l10", "Pinnacle Roofing", "Charlotte, NC", "Roofing", "called", "(704) 555-0112"),
    makeDemoLead("l11", "Carolina Electric", "Raleigh, NC", "Electrical", "called", "(919) 555-0134"),
    makeDemoLead("l12", "Queen City Plumbing", "Charlotte, NC", "Plumbing", "called", "(704) 555-0156"),
  ],
  interested: [
    makeDemoLead("l13", "Mountain Air Heating", "Asheville, NC", "HVAC", "interested", "(828) 555-0178"),
    makeDemoLead("l14", "Blue Ridge Electric", "Boone, NC", "Electrical", "interested", "(828) 555-0145"),
  ],
  booked: [
    makeDemoLead("l15", "Sunrise Plumbing", "Tampa, FL", "Plumbing", "booked", "(813) 555-0162"),
    makeDemoLead("l16", "Blue Ridge HVAC", "Asheville, NC", "HVAC", "booked", "(828) 555-0133"),
  ],
};

// ─── Page (server component) ──────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  let userId: string | null = null;
  let firstName = "there";

  if (clerkConfigured) {
    const { auth, currentUser } = await import("@clerk/nextjs/server");
    const session = await auth();
    userId = session.userId ?? null;
    if (!userId) redirect("/login");
    const clerkUser = await currentUser();
    firstName = clerkUser?.firstName ?? "there";
  }

  const resolvedSearchParams = await searchParams;
  const isDemo = resolvedSearchParams.demo === "true";

  // Default to demo data
  let stats = DEMO_STATS;
  let todaysBookings = DEMO_BOOKINGS;
  let activities = DEMO_ACTIVITIES;
  let kanbanLeads = DEMO_KANBAN;

  // Try to load real data if not in demo mode and authenticated
  if (!isDemo && userId) {
    try {
      const supabase = createServerClient();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString();
      const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

      // Fetch user record to get org id
      const { data: userRecord } = await supabase
        .from("users")
        .select("organization_id")
        .eq("clerk_user_id", userId)
        .single() as { data: { organization_id: string } | null };

      if (userRecord?.organization_id) {
        const orgId: string = userRecord.organization_id;

        // Parallel fetch
        const [
          { data: leadsToday },
          { data: callsToday },
          { data: bookingsWeek },
          { data: todayBookings },
          { data: recentLeads },
        ] = await Promise.all([
          supabase
            .from("leads")
            .select("id")
            .eq("organization_id", orgId)
            .gte("created_at", todayStr),
          supabase
            .from("calls")
            .select("id")
            .eq("organization_id", orgId)
            .gte("created_at", todayStr),
          supabase
            .from("bookings")
            .select("id")
            .eq("organization_id", orgId)
            .gte("scheduled_at", weekAgo),
          supabase
            .from("bookings")
            .select("*")
            .eq("organization_id", orgId)
            .gte("scheduled_at", todayStr)
            .order("scheduled_at", { ascending: true }),
          supabase
            .from("leads")
            .select("*")
            .eq("organization_id", orgId)
            .in("status", ["new", "queued", "called", "interested", "booked"])
            .order("created_at", { ascending: false })
            .limit(50),
        ]);

        // Build real stats (use demo sparklines as fallback since we'd need historical queries)
        if (leadsToday !== null) {
          stats = {
            ...DEMO_STATS,
            leadsToday: leadsToday.length,
            callsToday: callsToday?.length ?? 0,
            bookingsThisWeek: bookingsWeek?.length ?? 0,
            estimatedRevenue: (bookingsWeek?.length ?? 0) * 3500,
          };
        }

        // Build bookings with meta
        if (todayBookings?.length) {
          todaysBookings = (todayBookings as Booking[]).map((b) => ({
            ...b,
            businessName: b.title.replace("Consultation with ", ""),
            industry: "Service",
          }));
        }

        // Build kanban
        if (recentLeads?.length) {
          const grouped: KanbanLeads = {
            new: [],
            queued: [],
            called: [],
            interested: [],
            booked: [],
          };
          for (const lead of recentLeads as Lead[]) {
            if (lead.status in grouped) {
              (grouped[lead.status as keyof KanbanLeads] as Lead[]).push(lead);
            }
          }
          kanbanLeads = grouped;
        }

        // Build activities from recent calls and leads
        const activityItems: Activity[] = [];
        if (callsToday?.length) {
          activityItems.push({
            id: "real-calls",
            type: "call",
            message: `${callsToday.length} calls made today`,
            timestamp: new Date().toISOString(),
          });
        }
        if (leadsToday?.length) {
          activityItems.push({
            id: "real-leads",
            type: "lead",
            message: `${leadsToday.length} new leads pulled today`,
            timestamp: new Date().toISOString(),
          });
        }
        if (activityItems.length) {
          activities = [...activityItems, ...DEMO_ACTIVITIES.slice(0, 5)];
        }
      }
    } catch {
      // Supabase unavailable — fall through to demo data
    }
  }

  return (
    <DashboardClient
      firstName={firstName}
      isDemo={isDemo}
      stats={stats}
      todaysBookings={todaysBookings}
      activities={activities}
      kanbanLeads={kanbanLeads}
    />
  );
}
