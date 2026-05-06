// Sends daily performance summary email at 6PM in each org's timezone
import Bull from "bull";
import { createServerClient } from "@/lib/supabase";
import { sendDailySummary } from "@/lib/resend";
import type { DailySummaryStats, TomorrowBooking } from "@/lib/resend";
import type { PlanType } from "@/lib/types";

export interface DailySummaryJobData {
  // Empty for the cron-triggered global job; could include orgId for per-org runs
  triggeredAt?: string;
}

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

export const dailySummaryQueue = new Bull<DailySummaryJobData>("daily-summary", REDIS_URL, {
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 60000 },
    removeOnComplete: 10,
    removeOnFail: 20,
  },
});

/**
 * Given an IANA timezone and an hour (0–23), returns true if the current
 * local hour in that timezone equals the target hour.
 */
function isCurrentHourInTimezone(timezone: string, targetHour: number): boolean {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const hourPart = parts.find((p) => p.type === "hour");
    const hour = hourPart ? parseInt(hourPart.value, 10) : -1;
    return hour === targetHour;
  } catch {
    return false;
  }
}

function formatDayLabel(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

function formatTimeLabel(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return date.toLocaleTimeString();
  }
}

function getStartOfDayInTimezone(timezone: string): Date {
  const now = new Date();
  const tzFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const localDateStr = tzFormatter.format(now); // "YYYY-MM-DD"
  return new Date(`${localDateStr}T00:00:00.000Z`);
}

function getStartOfTomorrowInTimezone(timezone: string): { start: Date; end: Date } {
  const todayStart = getStartOfDayInTimezone(timezone);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const dayAfterStart = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000);
  return { start: tomorrowStart, end: dayAfterStart };
}

// Set up the repeating cron job — fires every hour; the handler checks if it's 6PM in each org's timezone
dailySummaryQueue.add(
  {},
  {
    repeat: { cron: "0 * * * *" }, // top of every hour
    jobId: "daily-summary-cron",
  }
);

dailySummaryQueue.process(async (job) => {
  const supabase = createServerClient();

  // 1. Fetch all active organizations
  const { data: orgs, error: orgsError } = await supabase
    .from("organizations")
    .select("id, name, settings, plan")
    .eq("subscription_status" as never, "active");

  if (orgsError) {
    throw new Error(`Failed to fetch active orgs: ${orgsError.message}`);
  }

  const activeOrgs = (orgs ?? []) as {
    id: string;
    name: string;
    settings: Record<string, unknown>;
    plan: PlanType;
  }[];

  let sentCount = 0;

  for (const org of activeOrgs) {
    const timezone = (org.settings as Record<string, string>)?.timezone ?? "America/New_York";
    const notificationEmail = (org.settings as Record<string, string>)?.notification_email;

    if (!notificationEmail) {
      continue;
    }

    // Only send at 6PM in the org's local timezone
    if (!isCurrentHourInTimezone(timezone, 18)) {
      continue;
    }

    try {
      const now = new Date();
      const dayStart = getStartOfDayInTimezone(timezone);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const { start: tomorrowStart, end: tomorrowEnd } = getStartOfTomorrowInTimezone(timezone);

      // Query leads pulled today
      const { count: leadsAdded } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .gte("created_at", dayStart.toISOString())
        .lt("created_at", dayEnd.toISOString());

      // Query calls made today
      const { data: todayCalls } = await supabase
        .from("calls")
        .select("outcome")
        .eq("organization_id", org.id)
        .gte("created_at", dayStart.toISOString())
        .lt("created_at", dayEnd.toISOString());

      const callsMade = todayCalls?.length ?? 0;
      const callsConnected = (todayCalls ?? []).filter((c: { outcome: string | null }) =>
        c.outcome && !["no_answer", "voicemail", null].includes(c.outcome)
      ).length;
      const interested = (todayCalls ?? []).filter((c: { outcome: string | null }) =>
        ["interested", "booked", "callback_requested"].includes(c.outcome ?? "")
      ).length;

      // Query bookings made today
      const { count: bookings } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .gte("created_at", dayStart.toISOString())
        .lt("created_at", dayEnd.toISOString());

      // Tomorrow's bookings
      const { data: tomorrowBookingsRaw } = await supabase
        .from("bookings")
        .select("title, scheduled_at, meet_link, lead_id")
        .eq("organization_id", org.id)
        .eq("status", "confirmed")
        .gte("scheduled_at", tomorrowStart.toISOString())
        .lt("scheduled_at", tomorrowEnd.toISOString())
        .order("scheduled_at", { ascending: true });

      // Fetch lead names for tomorrow's bookings
      const tomorrowLeadIds = (tomorrowBookingsRaw ?? [])
        .map((b: { lead_id: string }) => b.lead_id)
        .filter(Boolean);

      let leadNamesMap: Record<string, string> = {};
      if (tomorrowLeadIds.length > 0) {
        const { data: leadNames } = await supabase
          .from("leads")
          .select("id, full_name")
          .in("id", tomorrowLeadIds);
        leadNamesMap = Object.fromEntries(
          (leadNames ?? []).map((l: { id: string; full_name: string }) => [l.id, l.full_name])
        );
      }

      const tomorrowsBookings: TomorrowBooking[] = (tomorrowBookingsRaw ?? []).map(
        (b: { lead_id: string; scheduled_at: string; meet_link: string | null }) => ({
          leadName: leadNamesMap[b.lead_id] ?? "Unknown",
          scheduledAt: formatTimeLabel(new Date(b.scheduled_at), timezone),
          meetLink: b.meet_link ?? undefined,
        })
      );

      const connectionRate = callsMade > 0 ? Math.round((callsConnected / callsMade) * 100) : 0;
      const bookingRate = interested > 0 ? Math.round(((bookings ?? 0) / interested) * 100) : 0;

      const stats: DailySummaryStats = {
        orgName: org.name,
        date: formatDayLabel(now, timezone),
        leadsAdded: leadsAdded ?? 0,
        callsMade,
        callsConnected,
        interested,
        bookings: bookings ?? 0,
        tomorrowsBookings,
        connectionRate,
        bookingRate,
      };

      await sendDailySummary(notificationEmail, stats);
      sentCount++;
      console.log(`[dailySummary] Sent summary to org ${org.id} (${org.name})`);
    } catch (orgError) {
      console.error(`[dailySummary] Failed to send summary for org ${org.id}:`, orgError);
    }
  }

  console.log(`[dailySummary] Job ${job.id} complete — sent ${sentCount} summaries`);
});

dailySummaryQueue.on("failed", (job, err) => {
  console.error(`[dailySummary] Job ${job.id} failed:`, err.message);
});
