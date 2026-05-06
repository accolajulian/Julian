// Initiates and manages AI voice calls through Atlas

export interface AtlasCallParams {
  to_phone: string;
  business_name: string;
  owner_name: string;
  script: string;
  webhook_url: string;
}

export interface AtlasCallStatus {
  call_id: string;
  status: "queued" | "dialing" | "in_progress" | "completed" | "failed";
  duration_seconds: number | null;
  outcome: string | null;
  started_at: string | null;
  ended_at: string | null;
}

interface AtlasInitiateResponse {
  call_id: string;
  status: string;
}

const ATLAS_BASE_URL = process.env.ATLAS_API_BASE_URL ?? "https://api.atlas.ai/v1";

/**
 * Initiates an AI voice call through Atlas. Returns the Atlas call_id.
 */
export async function initiateCall(
  apiKey: string,
  params: AtlasCallParams
): Promise<string> {
  const response = await fetch(`${ATLAS_BASE_URL}/calls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      to_phone: params.to_phone,
      business_name: params.business_name,
      owner_name: params.owner_name,
      script: params.script,
      webhook_url: params.webhook_url,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(`Atlas initiateCall failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as AtlasInitiateResponse;

  if (!data.call_id) {
    throw new Error("Atlas API returned no call_id in response");
  }

  return data.call_id;
}

/**
 * Retrieves the current status of an Atlas call.
 */
export async function getCallStatus(
  apiKey: string,
  callId: string
): Promise<AtlasCallStatus> {
  const response = await fetch(`${ATLAS_BASE_URL}/calls/${encodeURIComponent(callId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(`Atlas getCallStatus failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as AtlasCallStatus;
  return data;
}

/**
 * Returns a realistic default calling script for the given industry.
 * Scripts are 3-4 sentences, conversational, and mention the specific service.
 */
export function getIndustryScript(industry: string): string {
  const normalised = industry.toLowerCase().trim();

  if (normalised.includes("hvac") || normalised.includes("heating") || normalised.includes("cooling") || normalised.includes("air conditioning")) {
    return "Hi, my name is [AI_NAME] calling on behalf of [BUSINESS_NAME]. We help HVAC companies in [COUNTY] get more booked service calls without any extra ad spend — using an AI-powered outreach system that runs around the clock. I'd love to set up a quick 15-minute demo with [OWNER_NAME] to show how it works. Would [OWNER_NAME] have a few minutes this week to take a look?";
  }

  if (normalised.includes("landscap") || normalised.includes("lawn") || normalised.includes("garden")) {
    return "Hi, this is [AI_NAME] reaching out on behalf of [BUSINESS_NAME]. We specialize in helping landscaping companies like yours fill their schedule with qualified residential and commercial clients — without you having to chase down every lead. I wanted to see if [OWNER_NAME] would be open to a quick 15-minute call to hear how we're helping other landscapers in the area grow. Does that sound like something worth exploring?";
  }

  if (normalised.includes("plumb")) {
    return "Hi, I'm [AI_NAME] calling on behalf of [BUSINESS_NAME]. We work with plumbing contractors across [STATE] to generate consistent service and installation calls using an automated outreach system that does the heavy lifting for you. I'd love to connect [OWNER_NAME] with our team for a short 15-minute walkthrough. Would [OWNER_NAME] have any availability this week?";
  }

  if (normalised.includes("auto") || normalised.includes("mechanic") || normalised.includes("repair")) {
    return "Hi there, I'm [AI_NAME] calling on behalf of [BUSINESS_NAME]. We help auto repair shops in [COUNTY] bring in more repeat customers and new repair jobs using a fully automated follow-up and outreach system. I wanted to reach out to [OWNER_NAME] directly to see if a brief 15-minute demo might be a good fit. Would [OWNER_NAME] be available for a quick call sometime this week?";
  }

  if (normalised.includes("roof")) {
    return "Hello, this is [AI_NAME] calling on behalf of [BUSINESS_NAME]. We partner with roofing companies to generate qualified inspection and replacement leads in their local market — without the overhead of a full sales team. I'd love to walk [OWNER_NAME] through a 15-minute demo to show the results we're seeing for other roofers in [STATE]. Is [OWNER_NAME] available for a brief call this week?";
  }

  // Generic fallback
  return "Hi, I'm [AI_NAME] calling on behalf of [BUSINESS_NAME]. We help local service businesses like yours generate more qualified leads and booked appointments using an AI-powered outreach system. I'd love to set up a quick 15-minute call with [OWNER_NAME] to show how we're helping other businesses in [COUNTY] grow their customer base. Would [OWNER_NAME] have a few minutes this week?";
}
