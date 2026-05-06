// Creates and manages Google Calendar events for bookings
import { google, calendar_v3 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

export interface BookingDetails {
  title: string;
  description?: string;
  guestEmail?: string;
  guestName?: string;
  startTime: Date;
  durationMinutes: number;
  timezone: string;
  organizerEmail?: string;
}

function buildOAuth2Client(refreshToken: string): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set.");
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

/**
 * Creates a Google Calendar event with a Google Meet conference link.
 * Returns the calendar event ID and Meet link.
 */
export async function createBookingEvent(
  refreshToken: string,
  calendarId: string,
  booking: BookingDetails
): Promise<{ eventId: string; meetLink: string }> {
  const auth = buildOAuth2Client(refreshToken);
  const calendar = google.calendar({ version: "v3", auth });

  const endTime = new Date(booking.startTime.getTime() + booking.durationMinutes * 60 * 1000);

  const eventBody: calendar_v3.Schema$Event = {
    summary: booking.title,
    description: booking.description ?? "",
    start: {
      dateTime: booking.startTime.toISOString(),
      timeZone: booking.timezone,
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: booking.timezone,
    },
    conferenceData: {
      createRequest: {
        requestId: `jac-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 24 * 60 },
        { method: "popup", minutes: 30 },
      ],
    },
  };

  if (booking.guestEmail) {
    eventBody.attendees = [
      ...(booking.organizerEmail ? [{ email: booking.organizerEmail, organizer: true }] : []),
      {
        email: booking.guestEmail,
        displayName: booking.guestName ?? booking.guestEmail,
      },
    ];
  }

  const response = await calendar.events.insert({
    calendarId,
    requestBody: eventBody,
    conferenceDataVersion: 1,
    sendUpdates: booking.guestEmail ? "all" : "none",
  });

  const event = response.data;

  if (!event.id) {
    throw new Error("Google Calendar event creation returned no event ID.");
  }

  const meetLink =
    event.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "video")?.uri ??
    event.hangoutLink ??
    "";

  return { eventId: event.id, meetLink };
}

/**
 * Cancels (deletes) a Google Calendar event.
 */
export async function cancelEvent(
  refreshToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const auth = buildOAuth2Client(refreshToken);
  const calendar = google.calendar({ version: "v3", auth });

  await calendar.events.delete({
    calendarId,
    eventId,
    sendUpdates: "all",
  });
}

/**
 * Checks whether a given time slot is free on the calendar.
 * Returns true if the slot is available.
 */
export async function checkAvailability(
  refreshToken: string,
  calendarId: string,
  start: Date,
  end: Date
): Promise<boolean> {
  const auth = buildOAuth2Client(refreshToken);
  const calendar = google.calendar({ version: "v3", auth });

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      items: [{ id: calendarId }],
    },
  });

  const busySlots = response.data.calendars?.[calendarId]?.busy ?? [];
  return busySlots.length === 0;
}

/**
 * Finds the next available 1-hour slot on or after preferredDate, within working hours.
 * Scans up to 14 days ahead before giving up.
 */
export async function findNextAvailableSlot(
  refreshToken: string,
  calendarId: string,
  preferredDate: Date,
  workingHours: { start: number; end: number } // 0-23 hour values
): Promise<Date> {
  const auth = buildOAuth2Client(refreshToken);
  const calendar = google.calendar({ version: "v3", auth });

  const slotDurationMs = 60 * 60 * 1000; // 1 hour
  const maxDaysAhead = 14;

  // Start from the preferred time, but clamp to working hours on that day
  let candidate = new Date(preferredDate);

  for (let dayOffset = 0; dayOffset <= maxDaysAhead; dayOffset++) {
    const dayStart = new Date(candidate);
    dayStart.setHours(workingHours.start, 0, 0, 0);

    const dayEnd = new Date(candidate);
    dayEnd.setHours(workingHours.end, 0, 0, 0);

    // Fetch all busy slots for this day in one shot
    const freebusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        items: [{ id: calendarId }],
      },
    });

    const busySlots = (freebusy.data.calendars?.[calendarId]?.busy ?? []).map((b) => ({
      start: new Date(b.start!).getTime(),
      end: new Date(b.end!).getTime(),
    }));

    // Walk through 1-hour slots during working hours
    let slotStart = Math.max(candidate.getTime(), dayStart.getTime());

    while (slotStart + slotDurationMs <= dayEnd.getTime()) {
      const slotEnd = slotStart + slotDurationMs;
      const hasConflict = busySlots.some(
        (busy) => slotStart < busy.end && slotEnd > busy.start
      );

      if (!hasConflict) {
        return new Date(slotStart);
      }

      slotStart += 30 * 60 * 1000; // advance by 30-min increments
    }

    // Move to start of next day's working hours
    candidate = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    candidate.setHours(workingHours.start, 0, 0, 0);
  }

  throw new Error(`No available slot found within ${maxDaysAhead} days from ${preferredDate.toISOString()}`);
}
