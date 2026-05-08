// Background job that picks up leads and sends them to Atlas for AI calling
import Bull from "bull";
import { createServerClient } from "@/lib/supabase";
import { initiateCall, getIndustryScript } from "@/lib/atlas";
import type { Lead, PlanType } from "@/lib/types";

export interface CallTriggeringJobData {
  organizationId: string;
  leadId?: string;
}

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

export const callTriggeringQueue = new Bull<CallTriggeringJobData>("call-triggering", REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 10000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

/**
 * Returns true if the current local time (in the given IANA timezone) is
 * within 8:00 AM – 8:00 PM (20:00).
 */
function isWithinCallingHours(timezone: string): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hourPart = parts.find((p) => p.type === "hour");
    const hour = hourPart ? parseInt(hourPart.value, 10) : -1;
    return hour >= 8 && hour < 20;
  } catch {
    // If timezone is invalid, default to allowing the call
    console.warn(`[callTrigger] Invalid timezone: ${timezone}, defaulting to allow.`);
    return true;
  }
}

callTriggeringQueue.process(async (job) => {
  const { organizationId, leadId } = job.data;
  const supabase = createServerClient();

  // 1. Fetch org record
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, plan, settings, subscription_status")
    .eq("id", organizationId)
    .single();

  if (orgError || !org) {
    throw new Error(`Org ${organizationId} not found: ${orgError?.message}`);
  }

  const orgRecord = org as {
    id: string;
    plan: PlanType;
    settings: Record<string, unknown>;
    subscription_status: string;
  };

  // 2. Guard: only call for active subscriptions
  if (orgRecord.subscription_status !== "active") {
    console.log(`[callTrigger] Org ${organizationId} subscription is ${orgRecord.subscription_status}. Skipping.`);
    return;
  }

  // 3. Time guard: only call between 8AM-8PM in org's timezone
  const timezone = (orgRecord.settings as Record<string, string>)?.timezone ?? "America/New_York";
  if (!isWithinCallingHours(timezone)) {
    console.log(`[callTrigger] Outside calling hours for org ${organizationId} (tz: ${timezone}). Requeueing.`);
    // Requeue for 1 hour later
    await callTriggeringQueue.add(
      { organizationId, leadId },
      { delay: 60 * 60 * 1000, attempts: 3, backoff: { type: "exponential", delay: 10000 } }
    );
    return;
  }

  // 4. Get Atlas API key from env (operator-level key shared across all orgs)
  const atlasApiKey = process.env.ATLAS_API_KEY;
  if (!atlasApiKey) {
    throw new Error("ATLAS_API_KEY env var is not set — cannot initiate calls.");
  }

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/atlas`;

  // 5. Get leads to call
  let leadsToCall: Lead[];

  if (leadId) {
    const { data: singleLead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .eq("organization_id", organizationId)
      .single();

    if (leadError || !singleLead) {
      throw new Error(`Lead ${leadId} not found: ${leadError?.message}`);
    }

    leadsToCall = [singleLead as Lead];
  } else {
    // Get all new/queued leads for the org, up to batch size of 50
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("*")
      .eq("organization_id", organizationId)
      .in("status", ["new", "queued"])
      .or(`next_call_at.is.null,next_call_at.lte.${new Date().toISOString()}`)
      .order("created_at", { ascending: true })
      .limit(50);

    if (leadsError) {
      throw new Error(`Failed to fetch leads for org ${organizationId}: ${leadsError.message}`);
    }

    leadsToCall = (leads ?? []) as Lead[];
  }

  if (leadsToCall.length === 0) {
    console.log(`[callTrigger] No leads to call for org ${organizationId}`);
    return;
  }

  // 6. Fetch org name for script personalization
  const { data: orgDetails } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .single();
  const orgName = (orgDetails as { name: string } | null)?.name ?? "our company";

  // 7. Process each lead
  let successCount = 0;
  let failCount = 0;

  for (const lead of leadsToCall) {
    try {
      // Get the industry and scripts from target if available
      let industry = "general";
      let scriptVariant: "a" | "b" = "a";
      let resolvedScript: string | null = null;

      if (lead.target_id) {
        const { data: target } = await supabase
          .from("targets")
          .select("industry, niche, call_script, settings")
          .eq("id", lead.target_id)
          .single();

        if (target) {
          const t = target as {
            industry: string | null;
            niche: string | null;
            call_script: string | null;
            settings: Record<string, unknown> | null;
          };
          industry = t.niche ?? t.industry ?? "general";

          const scriptB = t.settings?.script_b as string | undefined;
          const abEnabled = orgRecord.plan === "pro" && !!scriptB;

          if (abEnabled && Math.random() < 0.5) {
            scriptVariant = "b";
            resolvedScript = scriptB!;
          } else {
            resolvedScript = t.call_script;
          }
        }
      }

      const baseScript = resolvedScript ?? getIndustryScript(industry);
      const script = baseScript
        .replace(/\[BUSINESS_NAME\]/g, orgName)
        .replace(/\[OWNER_NAME\]/g, lead.full_name)
        .replace(/\[AI_NAME\]/g, "Alex");

      const atlasCallId = await initiateCall(atlasApiKey, {
        to_phone: lead.phone,
        business_name: orgName,
        owner_name: lead.full_name,
        script,
        webhook_url: webhookUrl,
      });

      // Mark lead as calling
      await supabase
        .from("leads")
        .update({
          status: "calling",
          last_called_at: new Date().toISOString(),
        } as never)
        .eq("id", lead.id);

      // Insert call record
      await supabase.from("calls").insert({
        organization_id: organizationId,
        lead_id: lead.id,
        target_id: lead.target_id ?? null,
        twilio_call_sid: atlasCallId, // store Atlas call_id in this field for webhook lookup
        direction: "outbound",
        status: "initiated",
        outcome: null,
        script_variant: scriptVariant,
        started_at: new Date().toISOString(),
      } as never);

      successCount++;
      console.log(`[callTrigger] Initiated call for lead ${lead.id}, atlas call_id: ${atlasCallId}`);
    } catch (callError) {
      failCount++;
      console.error(`[callTrigger] Failed to call lead ${lead.id}:`, callError);

      // Requeue this lead for a future attempt
      await supabase
        .from("leads")
        .update({ status: "queued" } as never)
        .eq("id", lead.id);
    }
  }

  console.log(`[callTrigger] Org ${organizationId}: ${successCount} calls initiated, ${failCount} failed`);
  await job.progress(100);
});

callTriggeringQueue.on("failed", (job, err) => {
  console.error(`[callTrigger] Job ${job.id} failed:`, err.message);
});

callTriggeringQueue.on("completed", (job) => {
  console.log(`[callTrigger] Job ${job.id} completed`);
});
