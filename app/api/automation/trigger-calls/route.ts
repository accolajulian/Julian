import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import type { PlanType } from "@/lib/types";
import Bull from "bull";

// ─── Queue ────────────────────────────────────────────────────────────────────

function getCallQueue() {
  return new Bull("outbound-calls", {
    redis: process.env.REDIS_URL ?? "redis://localhost:6379",
  });
}

// ─── Time guard: check if current time is within calling hours ────────────────

function isWithinCallingHours(
  timezone: string,
  startHhmm: string,
  endHhmm: string
): boolean {
  try {
    // Get current time in org's timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    const currentMinutes = hour * 60 + minute;

    const [startH, startM] = startHhmm.split(":").map(Number);
    const [endH, endM] = endHhmm.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch {
    // Default to allowing calls if timezone parsing fails
    return true;
  }
}

// ─── POST /api/automation/trigger-calls ──────────────────────────────────────

const triggerCallsSchema = z.object({
  leadId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServerClient();

    // Resolve org
    const { data: userRecord } = await supabase
      .from("users")
      .select("organization_id")
      .eq("clerk_id", userId)
      .single() as { data: { organization_id: string } | null };

    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const orgId = userRecord.organization_id;

    // Load org settings for time guard
    const { data: org } = await supabase
      .from("organizations")
      .select("plan, settings")
      .eq("id", orgId)
      .single() as {
        data: {
          plan: PlanType;
          settings: {
            timezone: string;
            calling_hours_start: string;
            calling_hours_end: string;
          };
        } | null;
      };

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Time guard — default 8AM-8PM if settings missing
    const timezone = org.settings?.timezone ?? "America/Chicago";
    const callingStart = org.settings?.calling_hours_start ?? "08:00";
    const callingEnd = org.settings?.calling_hours_end ?? "20:00";

    if (!isWithinCallingHours(timezone, callingStart, callingEnd)) {
      return NextResponse.json(
        {
          error: "Outside calling hours",
          message: `Calls are only allowed between ${callingStart} and ${callingEnd} ${timezone}. Current time is outside that window.`,
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = triggerCallsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Get leads to call
    let leadsQuery = supabase
      .from("leads")
      .select("id, phone")
      .eq("organization_id", orgId)
      .in("status", ["new", "queued"]);

    if (parsed.data.leadId) {
      leadsQuery = leadsQuery.eq("id", parsed.data.leadId);
    }

    const { data: leadsRaw } = await leadsQuery;
    const leads = (leadsRaw ?? []) as { id: string; phone: string }[];

    if (leads.length === 0) {
      return NextResponse.json(
        { queued: false, count: 0, message: "No leads available to call." },
        { status: 200 }
      );
    }

    // Queue call jobs
    const queue = getCallQueue();
    const jobs = await Promise.all(
      leads.map((lead) =>
        queue.add(
          {
            organizationId: orgId,
            leadId: lead.id,
            phone: lead.phone,
          },
          {
            attempts: 2,
            backoff: { type: "fixed", delay: 30000 },
            removeOnComplete: true,
          }
        )
      )
    );

    // Mark leads as queued
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("leads")
      .update({ status: "queued" })
      .in("id", leads.map((l: { id: string }) => l.id))
      .eq("organization_id", orgId);

    return NextResponse.json({
      queued: true,
      count: jobs.length,
      jobIds: jobs.map((j) => j.id),
    });
  } catch (err) {
    console.error("[POST /api/automation/trigger-calls]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
