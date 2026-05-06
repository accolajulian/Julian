// Sends SMS notifications for bookings and alerts
import twilio from "twilio";
import type { BookingDetails } from "./calendar";

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

function formatDate(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return date.toLocaleString("en-US");
  }
}

/**
 * Sends a booking confirmation SMS to the lead.
 */
export async function sendBookingConfirmation(
  credentials: TwilioCredentials,
  toPhone: string,
  booking: BookingDetails
): Promise<void> {
  const client = twilio(credentials.accountSid, credentials.authToken);

  const startTime = new Date(booking.startTime);
  const formattedDate = formatDate(startTime, booking.timezone);

  const meetInfo = booking.description?.includes("meet.google.com")
    ? `\nJoin the call: ${booking.description.match(/https:\/\/meet\.google\.com\/[^\s]+/)?.[0] ?? ""}`
    : "";

  const message =
    `✅ Your appointment is confirmed!\n\n` +
    `📅 ${booking.title}\n` +
    `🗓 ${formattedDate}\n` +
    `⏱ ${booking.durationMinutes} minutes${meetInfo}\n\n` +
    `Reply CANCEL to cancel. See you then!`;

  await client.messages.create({
    body: message,
    from: credentials.fromNumber,
    to: toPhone,
  });
}

/**
 * Sends a booking reminder SMS (typically 24h before the appointment).
 */
export async function sendBookingReminder(
  credentials: TwilioCredentials,
  toPhone: string,
  booking: BookingDetails
): Promise<void> {
  const client = twilio(credentials.accountSid, credentials.authToken);

  const startTime = new Date(booking.startTime);
  const formattedDate = formatDate(startTime, booking.timezone);

  const now = new Date();
  const hoursUntil = Math.round((startTime.getTime() - now.getTime()) / (1000 * 60 * 60));
  const timeLabel = hoursUntil <= 1 ? "in less than an hour" : `in ${hoursUntil} hours`;

  const meetInfo = booking.description?.includes("meet.google.com")
    ? `\nJoin here: ${booking.description.match(/https:\/\/meet\.google\.com\/[^\s]+/)?.[0] ?? ""}`
    : "";

  const message =
    `⏰ Reminder: You have an appointment ${timeLabel}!\n\n` +
    `📅 ${booking.title}\n` +
    `🗓 ${formattedDate}\n` +
    `⏱ ${booking.durationMinutes} minutes${meetInfo}\n\n` +
    `Reply CANCEL if you need to reschedule.`;

  await client.messages.create({
    body: message,
    from: credentials.fromNumber,
    to: toPhone,
  });
}
