// Receives call outcomes from Atlas AI after each AI call completes
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerClient } from "@/lib/supabase";
import type { CallOutcome } from "@/lib/types";
import { callTriggeringQueue, calendarBookingQueue } from "@/workers/index";

export const dynamic = "force-dynamic";

interface AtlasWebhookBody {
  call_id: string;
  lead_phone: string;
  outcome: string;
  notes: string;
  duration_seconds: number;
  preferred_callback_time?: string; // ISO date string
}

function mapAtlasOutcome(raw: string): CallOutcome {
  switch (raw) {
    case "interested":
      return "interested";
    case "not_interested":
      return "not_interested";
    case "no_answer":
      return "no_answer";
    case "voicemail":
      return "voicemail";
    case "callback":
    case "callback_requested":
      return "callback_requested";
    case "booked":
      return "booked";
    case "wrong_number":
      return "wrong_number";
    case "do_not_call":
      return "do_not_call";
    default:
      console.warn(`[atlas-webhook] Unknown Atlas outcome "${raw}", defaulting to no_answer`);
      return "no_answer";
  }
}

function verifyAtlasSignature(body: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("hex");
  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const atlasSecret = process.env.ATLAS_WEBHOOK_SECRET;
  if (!atlasSecret) {
    console.error("[atlas-webhook] ATLAS_WEBHOOK_SECRET is not set.");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const signature = request.headers.get("x-atlas-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing x-atlas-signature header" }, { status: 400 });
  }

  const body = await request.text();

  if (!verifyAtlasSignature(body, signature, atlasSecret)) {
    console.warn("[atlas-webhook] Signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: AtlasWebhookBody;
  try {
    payload = JSON.parse(body) as AtlasWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { call_id, lead_phone, outcome: rawOutcome, notes, duration_seconds, preferred_callback_time } = payload;

  if (!call_id || !lead_phone || !rawOutcome) {
    return NextResponse.json({ error: "Missing required fields: call_id, lead_phone, outcome" }, { status: 400 });
  }

  const outcome = mapAtlasOutcome(rawOutcome);
  const supabase = createServerClient();

  // Look up the call record
  const { data: call, error: callLookupError } = await supabase
    .from("calls")
    .select("id, lead_id, organization_id")
    .eq("twilio_call_sid", call_id)
    .single();

  if (callLookupError || !call) {
    // Try to find by call_id stored elsewhere — may have been stored as atlas call id
    console.error("[atlas-webhook] Could not find call record for call_id:", call_id, callLookupError);
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  const { id: callRecordId, lead_id: leadId, organization_id: orgId } = call as {
    id: string;
    lead_id: string;
    organization_id: string;
  };

  // Update calls table
  const { error: callUpdateError } = await supabase
    .from("calls")
    .update({
      outcome,
      duration_seconds,
      transcript: notes,
      status: "completed",
      ended_at: new Date().toISOString(),
    } as never)
    .eq("id", callRecordId);

  if (callUpdateError) {
    console.error("[atlas-webhook] Failed to update call record:", callUpdateError);
  }

  // Update leads table based on outcome
  const now = new Date();

  switch (outcome) {
    case "interested": {
      const leadUpdate: Record<string, unknown> = {
        status: "interested",
        last_called_at: now.toISOString(),
      };
      if (preferred_callback_time) {
        leadUpdate.next_call_at = preferred_callback_time;
      }

      await supabase.from("leads").update(leadUpdate as never).eq("id", leadId);

      // Trigger booking flow if there's a preferred time
      if (preferred_callback_time) {
        await calendarBookingQueue.add(
          {
            organizationId: orgId,
            leadId,
            callId: callRecordId,
            preferredTime: preferred_callback_time,
          },
          { attempts: 3, backoff: { type: "exponential", delay: 5000 } }
        );
      }
      break;
    }

    case "not_interested": {
      await supabase
        .from("leads")
        .update({ status: "dead", last_called_at: now.toISOString() } as never)
        .eq("id", leadId);
      break;
    }

    case "no_answer": {
      // Schedule follow-up in 3 days
      const followUpDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      await supabase
        .from("leads")
        .update({
          status: "queued",
          last_called_at: now.toISOString(),
          next_call_at: followUpDate.toISOString(),
        } as never)
        .eq("id", leadId);

      const delay = followUpDate.getTime() - Date.now();
      await callTriggeringQueue.add(
        { organizationId: orgId, leadId },
        { delay, attempts: 2, backoff: { type: "exponential", delay: 10000 } }
      );
      break;
    }

    case "voicemail": {
      // Schedule follow-up in 24 hours
      const followUpDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      await supabase
        .from("leads")
        .update({
          status: "queued",
          last_called_at: now.toISOString(),
          next_call_at: followUpDate.toISOString(),
        } as never)
        .eq("id", leadId);

      const delay = followUpDate.getTime() - Date.now();
      await callTriggeringQueue.add(
        { organizationId: orgId, leadId },
        { delay, attempts: 2, backoff: { type: "exponential", delay: 10000 } }
      );
      break;
    }

    case "callback_requested": {
      const callbackTime = preferred_callback_time
        ? new Date(preferred_callback_time)
        : new Date(now.getTime() + 4 * 60 * 60 * 1000); // default 4h

      await supabase
        .from("leads")
        .update({
          status: "called",
          last_called_at: now.toISOString(),
          next_call_at: callbackTime.toISOString(),
        } as never)
        .eq("id", leadId);

      const delay = Math.max(0, callbackTime.getTime() - Date.now());
      await callTriggeringQueue.add(
        { organizationId: orgId, leadId },
        { delay, attempts: 2, backoff: { type: "exponential", delay: 10000 } }
      );
      break;
    }

    default:
      // booked, wrong_number, do_not_call — just update last_called_at
      await supabase
        .from("leads")
        .update({ last_called_at: now.toISOString() } as never)
        .eq("id", leadId);
  }

  // Create a notification for the dashboard
  await supabase.from("notifications").insert({
    organization_id: orgId,
    user_id: null,
    type: "call_completed",
    title: "Call Completed",
    message: `Call outcome: ${outcome}. ${notes ? notes.slice(0, 120) : ""}`,
    action_url: `/leads/${leadId}`,
    is_read: false,
    metadata: { call_id: callRecordId, lead_id: leadId, outcome, duration_seconds },
  } as never);

  // Emit Socket.io event for real-time dashboard update
  try {
    const { getSocketServer } = await import("@/lib/socket");
    const io = getSocketServer();
    if (io) {
      io.to(`org:${orgId}`).emit("call_completed", {
        callId: callRecordId,
        leadId,
        outcome,
        durationSeconds: duration_seconds,
        notes,
      });
    }
  } catch (socketError) {
    // Non-fatal — dashboard will poll as fallback
    console.warn("[atlas-webhook] Could not emit socket event:", socketError);
  }

  return NextResponse.json({ received: true });
}
