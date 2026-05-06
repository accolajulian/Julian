// Background job that fetches leads from Apollo.io for a target
import Bull from "bull";
import { createServerClient } from "@/lib/supabase";
import { decrypt } from "@/lib/encryption";
import { searchLeads, formatApolloLead } from "@/lib/apollo";
import { PLAN_LIMITS } from "@/lib/stripe";
import type { PlanType } from "@/lib/types";

export interface LeadPullingJobData {
  organizationId: string;
  targetId: string;
}

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

export const leadPullingQueue = new Bull<LeadPullingJobData>("lead-pulling", REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

leadPullingQueue.process(async (job) => {
  const { organizationId, targetId } = job.data;
  const supabase = createServerClient();

  // 1. Fetch org record (includes plan and encrypted Apollo key)
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, plan, leads_used_this_month, settings")
    .eq("id", organizationId)
    .single();

  if (orgError || !org) {
    throw new Error(`Org ${organizationId} not found: ${orgError?.message}`);
  }

  const orgRecord = org as {
    id: string;
    plan: PlanType;
    leads_used_this_month: number;
    settings: Record<string, unknown>;
  };

  // 2. Check monthly lead limit before doing any work
  const limit = PLAN_LIMITS[orgRecord.plan].leads;
  if (limit !== Infinity && orgRecord.leads_used_this_month >= limit) {
    console.log(`[leadPuller] Org ${organizationId} has hit monthly lead limit (${limit}). Skipping.`);
    await supabase.from("notifications").insert({
      organization_id: organizationId,
      user_id: null,
      type: "limit_warning",
      title: "Monthly Lead Limit Reached",
      message: `Your ${orgRecord.plan} plan allows up to ${limit} leads per month. Upgrade to pull more leads.`,
      action_url: "/settings/billing",
      is_read: false,
      metadata: { plan: orgRecord.plan, limit, used: orgRecord.leads_used_this_month },
    } as never);
    return;
  }

  // 3. Fetch the encrypted Apollo API key from org settings
  const apolloKeyEncrypted = (orgRecord.settings as Record<string, string>)?.apollo_api_key_encrypted;
  if (!apolloKeyEncrypted) {
    throw new Error(`Org ${organizationId} has no Apollo API key configured.`);
  }

  let apolloApiKey: string;
  try {
    apolloApiKey = decrypt(apolloKeyEncrypted);
  } catch (decryptError) {
    throw new Error(`Failed to decrypt Apollo API key for org ${organizationId}: ${decryptError}`);
  }

  // 4. Fetch the target
  const { data: target, error: targetError } = await supabase
    .from("targets")
    .select("id, industry, niche")
    .eq("id", targetId)
    .eq("organization_id", organizationId)
    .single();

  if (targetError || !target) {
    throw new Error(`Target ${targetId} not found: ${targetError?.message}`);
  }

  const targetRecord = target as { id: string; industry: string | null; niche: string | null };
  const industry = targetRecord.niche ?? targetRecord.industry ?? "general contractor";

  // Extract county and state from org settings
  const county = (orgRecord.settings as Record<string, string>)?.county ?? "";
  const state = (orgRecord.settings as Record<string, string>)?.state ?? "";

  if (!county || !state) {
    throw new Error(`Org ${organizationId} is missing county/state in settings.`);
  }

  // 5. Calculate how many leads we can still pull this month
  const remaining = limit === Infinity ? 100 : Math.min(100, limit - orgRecord.leads_used_this_month);

  // 6. Fetch leads from Apollo
  await job.progress(10);
  const apolloLeads = await searchLeads(apolloApiKey, industry, county, state, remaining);
  await job.progress(50);

  if (apolloLeads.length === 0) {
    console.log(`[leadPuller] Apollo returned 0 leads for target ${targetId}`);
    return;
  }

  // 7. Deduplicate: collect apollo_ids from results and filter out existing ones
  const apolloIds = apolloLeads.map((l) => l.id);

  const { data: existingLeads } = await supabase
    .from("leads")
    .select("custom_fields")
    .eq("organization_id", organizationId)
    .in("custom_fields->>apollo_id", apolloIds);

  const existingApolloIds = new Set(
    (existingLeads ?? []).map(
      (l: { custom_fields: Record<string, unknown> }) => l.custom_fields?.apollo_id as string
    ).filter(Boolean)
  );

  const newApolloLeads = apolloLeads.filter((l) => !existingApolloIds.has(l.id));
  await job.progress(60);

  if (newApolloLeads.length === 0) {
    console.log(`[leadPuller] All ${apolloLeads.length} leads already exist for org ${organizationId}`);
    return;
  }

  // 8. Bulk insert new leads
  const leadsToInsert = newApolloLeads.map((raw) => ({
    ...formatApolloLead(raw),
    organization_id: organizationId,
    target_id: targetId,
    call_attempts: 0,
    status: "new" as const,
    custom_fields: {
      ...(formatApolloLead(raw).custom_fields ?? {}),
      apollo_id: raw.id,
    },
  }));

  const { error: insertError } = await supabase.from("leads").insert(leadsToInsert as never);

  if (insertError) {
    throw new Error(`Failed to insert leads for org ${organizationId}: ${insertError.message}`);
  }

  await job.progress(80);

  // 9. Update monthly usage counter
  await supabase
    .from("organizations")
    .update({ leads_used_this_month: orgRecord.leads_used_this_month + newApolloLeads.length } as never)
    .eq("id", organizationId);

  // 10. Create notification
  await supabase.from("notifications").insert({
    organization_id: organizationId,
    user_id: null,
    type: "system",
    title: "Leads Added",
    message: `${newApolloLeads.length} new leads added for target "${industry}" in ${county}, ${state}.`,
    action_url: `/leads?target=${targetId}`,
    is_read: false,
    metadata: { count: newApolloLeads.length, targetId, industry, county, state },
  } as never);

  // 11. Emit socket event
  try {
    const { getSocketServer } = await import("@/lib/socket");
    const io = getSocketServer();
    if (io) {
      io.to(`org:${organizationId}`).emit("leads_added", {
        count: newApolloLeads.length,
        targetId,
      });
    }
  } catch {
    // Non-fatal
  }

  await job.progress(100);
  console.log(`[leadPuller] Inserted ${newApolloLeads.length} leads for org ${organizationId}, target ${targetId}`);
});

leadPullingQueue.on("failed", (job, err) => {
  console.error(`[leadPuller] Job ${job.id} failed:`, err.message);
});

leadPullingQueue.on("completed", (job) => {
  console.log(`[leadPuller] Job ${job.id} completed`);
});
