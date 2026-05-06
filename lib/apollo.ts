// Fetches leads from Apollo.io based on industry and location filters
import type { Lead } from "@/lib/types";

export interface ApolloLead {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  email: string | null;
  phone_numbers: { raw_number: string; sanitized_number: string; type: string | null }[];
  title: string | null;
  linkedin_url: string | null;
  organization: {
    name: string | null;
    website_url: string | null;
  } | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

interface ApolloSearchResponse {
  people: ApolloLead[];
  pagination: {
    page: number;
    per_page: number;
    total_entries: number;
    total_pages: number;
  };
}

const APOLLO_BASE_URL = "https://api.apollo.io/api/v1";

/**
 * Exponential backoff sleep helper.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Searches Apollo.io for leads matching the given industry and location.
 * Handles 429 rate-limit responses with exponential backoff (up to 4 retries).
 */
export async function searchLeads(
  apiKey: string,
  industry: string,
  county: string,
  state: string,
  limit: number
): Promise<ApolloLead[]> {
  const perPage = Math.min(limit, 100); // Apollo max per_page is 100
  const totalPagesNeeded = Math.ceil(limit / perPage);

  const allLeads: ApolloLead[] = [];

  for (let page = 1; page <= totalPagesNeeded; page++) {
    if (allLeads.length >= limit) break;

    const body = {
      person_locations: [`${county}, ${state}`],
      q_keywords: industry,
      contact_email_status: ["verified"],
      per_page: perPage,
      page,
    };

    let response: Response | null = null;
    let lastError: Error | null = null;
    const maxRetries = 4;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        // Exponential backoff: 2^attempt * 1000ms (2s, 4s, 8s, 16s)
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.log(`[apollo] Rate limited, retrying in ${backoffMs}ms (attempt ${attempt}/${maxRetries})`);
        await sleep(backoffMs);
      }

      try {
        response = await fetch(`${APOLLO_BASE_URL}/mixed_people/search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apiKey,
          },
          body: JSON.stringify(body),
        });

        if (response.status === 429) {
          lastError = new Error("Apollo rate limit exceeded");
          response = null;
          continue; // retry
        }

        break; // success or non-429 error — don't retry
      } catch (fetchError) {
        lastError = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
        if (attempt === maxRetries) throw lastError;
      }
    }

    if (!response) {
      throw lastError ?? new Error("Apollo API request failed after retries");
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown error");
      throw new Error(`Apollo API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as ApolloSearchResponse;

    if (!Array.isArray(data.people) || data.people.length === 0) {
      break; // No more results
    }

    allLeads.push(...data.people);

    // If we've fetched all available records, stop early
    if (data.people.length < perPage) break;
  }

  return allLeads.slice(0, limit);
}

/**
 * Maps a raw Apollo API person record to our internal Lead shape.
 * Only fills fields that Apollo provides; DB-managed fields (id, timestamps, etc.) are omitted.
 */
export function formatApolloLead(raw: ApolloLead): Partial<Lead> {
  // Prefer mobile phone, fall back to work phone, then any phone
  const phone =
    raw.phone_numbers?.find((p) => p.type === "mobile")?.sanitized_number ??
    raw.phone_numbers?.find((p) => p.type === "work")?.sanitized_number ??
    raw.phone_numbers?.[0]?.sanitized_number ??
    "";

  return {
    first_name: raw.first_name ?? "",
    last_name: raw.last_name ?? "",
    full_name: raw.name ?? `${raw.first_name ?? ""} ${raw.last_name ?? ""}`.trim(),
    email: raw.email ?? null,
    phone,
    company: raw.organization?.name ?? null,
    title: raw.title ?? null,
    linkedin_url: raw.linkedin_url ?? null,
    website: raw.organization?.website_url ?? null,
    status: "new",
    custom_fields: {
      apollo_id: raw.id,
      city: raw.city,
      state: raw.state,
      country: raw.country,
    },
  };
}
