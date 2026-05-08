import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface ScriptInput {
  businessName: string;
  industry: string;
  locationCounty?: string;
  locationState?: string;
  websiteUrl?: string;
  avgJobValue?: number;
}

// Fetch plain text from a website URL for context injection
async function fetchWebsiteText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadEmm/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Strip tags, collapse whitespace, cap at 2000 chars
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);
  } catch {
    return null;
  }
}

export async function generateCallScript(input: ScriptInput): Promise<string> {
  const { businessName, industry, locationCounty, locationState, websiteUrl, avgJobValue } = input;

  let websiteContext = "";
  if (websiteUrl) {
    const text = await fetchWebsiteText(websiteUrl);
    if (text) websiteContext = `\n\nWebsite content (for context):\n${text}`;
  }

  const location = [locationCounty, locationState].filter(Boolean).join(", ");
  const jobValueNote = avgJobValue ? ` The average job value is $${avgJobValue.toLocaleString()}.` : "";

  const prompt = `You are a top-performing outbound sales rep for a home services company. Write a cold call script for AI phone calls targeting local businesses.

Business details:
- Company name: ${businessName}
- Industry: ${industry}
- Location: ${location || "not specified"}${jobValueNote}${websiteContext}

Requirements:
- Opening: introduce the caller as a representative of ${businessName}, get attention quickly
- Value prop: mention they help local ${industry} businesses get more booked jobs through AI-powered outreach
- Qualify: ask if they're taking on new customers right now
- Handle 2-3 common objections (busy, not interested, already have enough work)
- Close: offer to book a quick 15-minute discovery call
- Voicemail fallback: 20-second version if no answer
- Tone: confident, conversational, not pushy — like a real human rep
- Length: 200-350 words for the main script

Format the output as:
OPENING:
[script]

VALUE PROP:
[script]

QUALIFY:
[script]

OBJECTION HANDLING:
[objections and responses]

CLOSE:
[script]

VOICEMAIL:
[script]`;

  const message = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  return textBlock.text;
}
