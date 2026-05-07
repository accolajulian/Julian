// Background job that creates Google Calendar events for interested leads
import Bull from "bull";
import { createServerClient } from "@/lib/supabase";
import { decrypt } from "@/lib/encryption";
import { createBookingEvent, findNextAvailableSlot } from "@/lib/calendar";
import { sendBookingConfirmation } from "@/lib/twilio";
import { sendBookingNotification } from "@/lib/resend";
import type { TwilioCredentials } from "@/lib/twilio";

export interface CalendarBookingJobData {
  organizationId: string;
  leadId: string;
  callId: string;
  preferredTime?: string; // ISO date string
}

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

export const calendarBookingQueue = new Bull<CalendarBookingJobData>("calendar-booking", REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

calendarBookingQueue.process(async (job) => {
  const { organizationId, leadId, callId, preferredTime } = job.data;
  const supabase = createServerClient();

  // 1. Fetch org record with settings
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, settings")
    .eq("id", organizationId)
    .single();

  if (orgError || !org) {
    throw new Error(`Org ${organizationId} not found: ${orgError?.message}`);
  }

  const orgRecord = org as {
    id: string;
    name: string;
    settings: Record<string, unknown>;
  };
  const settings = orgRecord.settings;

  // 2. Decrypt Google refresh token and get calendar ID
  const googleRefreshTokenEncrypted = (settings as Record<string, string>)?.google_refresh_token_encrypted;
  const calendarId = (settings as Record<string, string>)?.google_calendar_id ?? "primary";

  if (!googleRefreshTokenEncrypted) {
    throw new Error(`Org ${organizationId} has no Google refresh token configured.`);
  }

  let googleRefreshToken: string;
  try {
    googleRefreshToken = decrypt(googleRefreshTokenEncrypted);
  } catch (decryptError) {
    throw new Error(`Failed to decrypt Google refresh token for org ${organizationId}: ${decryptError}`);
  }

  // 3. Parse working hours from org settings
  const callingHoursStart = (settings as Record<string, string>)?.calling_hours_start ?? "08:00";
  const callingHoursEnd = (settings as Record<string, string>)?.calling_hours_end ?? "20:00";
  const timezone = (settings as Record<string, string>)?.timezone ?? "America/New_York";

  const workingHours = {
    start: parseInt(callingHoursStart.split(":")[0], 10),
    end: parseInt(callingHoursEnd.split(":")[0], 10),
  };

  // 4. Fetch lead details
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .single();

  if (leadError || !lead) {
    throw new Error(`Lead ${leadId} not found: ${leadError?.message}`);
  }

  const leadRecord = lead as {
    id: string;
    full_name: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string;
    company: string | null;
    target_id: string | null;
  };

  await job.progress(20);

  // 5. Find available calendar slot near preferred time
  const preferredDate = preferredTime ? new Date(preferredTime) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  let scheduledSlot: Date;

  try {
    scheduledSlot = await findNextAvailableSlot(
      googleRefreshToken,
      calendarId,
      preferredDate,
      workingHours
    );
  } catch (slotError) {
    throw new Error(`Could not find available slot for lead ${leadId}: ${slotError}`);
  }

  await job.progress(40);

  // 6. Get org owner email for organizer
  const { data: ownerUser } = await supabase
    .from("users")
    .select("email")
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .single();

  const organizerEmail = (ownerUser as { email: string } | null)?.email;
  const notificationEmail = (settings as Record<string, string>)?.notification_email ?? organizerEmail ?? "";

  // 7. Create Google Calendar event with Meet link
  const bookingTitle = `Discovery Call – ${leadRecord.full_name}${leadRecord.company ? ` (${leadRecord.company})` : ""}`;
  const bookingDescription =
    `Prospect: ${leadRecord.full_name}\n` +
    (leadRecord.company ? `Company: ${leadRecord.company}\n` : "") +
    (leadRecord.email ? `Email: ${leadRecord.email}\n` : "") +
    `Phone: ${leadRecord.phone}\n\n` +
    `Booked via LeadMey`;

  let eventId: string;
  let meetLink: string;

  try {
    ({ eventId, meetLink } = await createBookingEvent(googleRefreshToken, calendarId, {
      title: bookingTitle,
      description: bookingDescription,
      guestEmail: leadRecord.email ?? undefined,
      guestName: leadRecord.full_name,
      startTime: scheduledSlot,
      durationMinutes: 30,
      timezone,
      organizerEmail,
    }));
  } catch (calendarError) {
    throw new Error(`Google Calendar event creation failed: ${calendarError}`);
  }

  await job.progress(60);

  // 8. Insert booking record in DB
  const { data: booking, error: bookingInsertError } = await supabase
    .from("bookings")
    .insert({
      organization_id: organizationId,
      lead_id: leadId,
      call_id: callId,
      target_id: leadRecord.target_id ?? null,
      calendar_event_id: eventId,
      calendar_provider: "google",
      title: bookingTitle,
      description: bookingDescription,
      scheduled_at: scheduledSlot.toISOString(),
      duration_minutes: 30,
      timezone,
      meet_link: meetLink || null,
      status: "confirmed",
      cancelled_at: null,
      cancellation_reason: null,
    } as never)
    .select("id")
    .single();

  if (bookingInsertError || !booking) {
    throw new Error(`Failed to insert booking record: ${bookingInsertError?.message}`);
  }

  const bookingId = (booking as { id: string }).id;

  // 9. Update lead status to 'booked'
  await supabase
    .from("leads")
    .update({ status: "booked" } as never)
    .eq("id", leadId);

  await job.progress(75);

  // 10. Send Twilio SMS notification to the lead
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFromNumber = process.env.TWILIO_FROM_NUMBER;

  if (twilioAccountSid && twilioAuthToken && twilioFromNumber && leadRecord.phone) {
    const twilioCredentials: TwilioCredentials = {
      accountSid: twilioAccountSid,
      authToken: twilioAuthToken,
      fromNumber: twilioFromNumber,
    };

    try {
      await sendBookingConfirmation(twilioCredentials, leadRecord.phone, {
        title: bookingTitle,
        description: meetLink ? `Join the call: ${meetLink}` : "",
        startTime: scheduledSlot,
        durationMinutes: 30,
        timezone,
      });
    } catch (smsError) {
      // Non-fatal — log and continue
      console.warn(`[calendarBooker] SMS to ${leadRecord.phone} failed:`, smsError);
    }
  }

  // 11. Send booking confirmation email to org owner
  if (notificationEmail) {
    try {
      await sendBookingNotification(notificationEmail, {
        title: bookingTitle,
        description: bookingDescription,
        guestName: leadRecord.full_name,
        guestEmail: leadRecord.email ?? undefined,
        startTime: scheduledSlot,
        durationMinutes: 30,
        timezone,
      });
    } catch (emailError) {
      console.warn(`[calendarBooker] Booking notification email failed:`, emailError);
    }
  }

  await job.progress(90);

  // 12. Create notification record
  await supabase.from("notifications").insert({
    organization_id: organizationId,
    user_id: null,
    type: "booking",
    title: "New Booking Confirmed",
    message: `${leadRecord.full_name} booked for ${scheduledSlot.toLocaleString("en-US", { timeZone: timezone })}.`,
    action_url: `/bookings/${bookingId}`,
    is_read: false,
    metadata: { bookingId, leadId, callId, eventId, meetLink },
  } as never);

  // 13. Emit socket event
  try {
    const { getSocketServer } = await import("@/lib/socket");
    const io = getSocketServer();
    if (io) {
      io.to(`org:${organizationId}`).emit("booking_created", {
        bookingId,
        leadId,
        leadName: leadRecord.full_name,
        scheduledAt: scheduledSlot.toISOString(),
        meetLink,
      });
    }
  } catch {
    // Non-fatal
  }

  await job.progress(100);
  console.log(`[calendarBooker] Booking created for lead ${leadId}, event ${eventId}`);
});

calendarBookingQueue.on("failed", (job, err) => {
  console.error(`[calendarBooker] Job ${job.id} failed:`, err.message);
});

calendarBookingQueue.on("completed", (job) => {
  console.log(`[calendarBooker] Job ${job.id} completed`);
});
