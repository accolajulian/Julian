// Sends transactional emails using Resend
import { Resend } from "resend";
import type { BookingDetails } from "./calendar";

export interface DailySummaryStats {
  orgName: string;
  date: string; // "Monday, January 6"
  leadsAdded: number;
  callsMade: number;
  callsConnected: number;
  interested: number;
  bookings: number;
  tomorrowsBookings: TomorrowBooking[];
  connectionRate: number; // 0-100
  bookingRate: number;    // 0-100
}

export interface TomorrowBooking {
  leadName: string;
  scheduledAt: string; // formatted time string
  meetLink?: string;
}

export interface WeeklyReportData {
  orgName: string;
  weekRange: string; // "Jan 1 – Jan 7, 2026"
  totalLeads: number;
  totalCalls: number;
  totalBookings: number;
  connectionRate: number;
  bookingRate: number;
  topPerformingDay: string;
  dailyBreakdown: { date: string; calls: number; bookings: number }[];
}

function getResendClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set.");
  return new Resend(key);
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "LeadMey <noreply@jacbuilds.com>";

function formatDate(date: Date, timezone?: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone ?? "America/New_York",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

/**
 * Sends a welcome email to a new subscriber.
 */
export async function sendWelcomeEmail(
  to: string,
  name: string,
  orgName: string
): Promise<void> {
  const resend = getResendClient();

  const firstName = name.split(" ")[0];

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Welcome to LeadMey, ${firstName}!`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); padding: 40px 40px 32px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">LeadMey</h1>
      <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 15px;">Your AI-powered growth engine is ready</p>
    </div>
    <div style="padding: 40px;">
      <h2 style="margin: 0 0 16px; color: #111827; font-size: 22px;">Welcome aboard, ${firstName}! 🚀</h2>
      <p style="color: #374151; line-height: 1.6; margin: 0 0 20px;">
        You've successfully activated <strong>${orgName}</strong> on LeadMey. Your AI calling system is now set up and ready to start generating qualified leads for your business.
      </p>
      <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 0 0 24px;">
        <p style="margin: 0; color: #1e40af; font-weight: 600; font-size: 15px;">Here's what happens next:</p>
        <ul style="margin: 8px 0 0; padding: 0 0 0 20px; color: #374151; line-height: 1.8;">
          <li>Set up your first Target audience in the dashboard</li>
          <li>Connect your Apollo.io API key for lead sourcing</li>
          <li>Add your Atlas AI calling credentials</li>
          <li>Connect Google Calendar for booking integration</li>
        </ul>
      </div>
      <div style="text-align: center; margin: 32px 0 24px;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.jacbuilds.com'}/dashboard"
           style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Go to Dashboard →
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0;">
        Questions? Reply to this email or reach us at <a href="mailto:support@jacbuilds.com" style="color: #2563eb;">support@jacbuilds.com</a>
      </p>
    </div>
    <div style="background: #f9fafb; border-top: 1px solid #e5e7eb; padding: 20px 40px; text-align: center;">
      <p style="color: #9ca3af; font-size: 13px; margin: 0;">© ${new Date().getFullYear()} LeadMey. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  });
}

/**
 * Sends a booking notification email to the org owner.
 */
export async function sendBookingNotification(
  to: string,
  booking: BookingDetails
): Promise<void> {
  const resend = getResendClient();

  const formattedDate = formatDate(new Date(booking.startTime), booking.timezone);

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `New Booking: ${booking.title}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: #059669; padding: 32px 40px; text-align: center;">
      <p style="color: #ffffff; font-size: 36px; margin: 0;">📅</p>
      <h1 style="color: #ffffff; margin: 8px 0 0; font-size: 22px; font-weight: 700;">New Booking!</h1>
    </div>
    <div style="padding: 40px;">
      <h2 style="margin: 0 0 8px; color: #111827; font-size: 20px;">${booking.title}</h2>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 10px 0; color: #6b7280; font-size: 14px; width: 120px;">📆 Date & Time</td>
          <td style="padding: 10px 0; color: #111827; font-weight: 500;">${formattedDate}</td>
        </tr>
        <tr style="border-top: 1px solid #f3f4f6;">
          <td style="padding: 10px 0; color: #6b7280; font-size: 14px;">⏱ Duration</td>
          <td style="padding: 10px 0; color: #111827; font-weight: 500;">${booking.durationMinutes} minutes</td>
        </tr>
        ${booking.guestName ? `<tr style="border-top: 1px solid #f3f4f6;">
          <td style="padding: 10px 0; color: #6b7280; font-size: 14px;">👤 Guest</td>
          <td style="padding: 10px 0; color: #111827; font-weight: 500;">${booking.guestName}${booking.guestEmail ? ` &lt;${booking.guestEmail}&gt;` : ""}</td>
        </tr>` : ""}
      </table>
      ${booking.description ? `<div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin-top: 16px;">
        <p style="color: #374151; font-size: 14px; line-height: 1.6; margin: 0;">${booking.description}</p>
      </div>` : ""}
      <div style="text-align: center; margin: 32px 0 0;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.jacbuilds.com'}/bookings"
           style="display: inline-block; background: #059669; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600;">
          View All Bookings →
        </a>
      </div>
    </div>
  </div>
</body>
</html>`,
  });
}

/**
 * Sends the nightly daily summary email.
 */
export async function sendDailySummary(
  to: string,
  stats: DailySummaryStats
): Promise<void> {
  const resend = getResendClient();

  const tomorrowRows = stats.tomorrowsBookings
    .map(
      (b) => `<tr style="border-top: 1px solid #f3f4f6;">
        <td style="padding: 10px 12px; color: #111827; font-weight: 500;">${b.leadName}</td>
        <td style="padding: 10px 12px; color: #374151;">${b.scheduledAt}</td>
        <td style="padding: 10px 12px;">${b.meetLink ? `<a href="${b.meetLink}" style="color: #2563eb; font-size: 13px;">Join</a>` : "—"}</td>
      </tr>`
    )
    .join("");

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `📊 Daily Summary – ${stats.date}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: #1e3a5f; padding: 28px 40px;">
      <p style="color: rgba(255,255,255,0.6); margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Daily Summary</p>
      <h1 style="color: #ffffff; margin: 4px 0 0; font-size: 22px;">${stats.orgName} — ${stats.date}</h1>
    </div>
    <div style="padding: 32px 40px;">
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 32px;">
        <div style="background: #eff6ff; padding: 20px; border-radius: 10px; text-align: center;">
          <p style="font-size: 32px; font-weight: 700; color: #2563eb; margin: 0;">${stats.leadsAdded}</p>
          <p style="color: #6b7280; font-size: 13px; margin: 4px 0 0;">Leads Added</p>
        </div>
        <div style="background: #f0fdf4; padding: 20px; border-radius: 10px; text-align: center;">
          <p style="font-size: 32px; font-weight: 700; color: #059669; margin: 0;">${stats.callsMade}</p>
          <p style="color: #6b7280; font-size: 13px; margin: 4px 0 0;">Calls Made</p>
        </div>
        <div style="background: #fefce8; padding: 20px; border-radius: 10px; text-align: center;">
          <p style="font-size: 32px; font-weight: 700; color: #d97706; margin: 0;">${stats.interested}</p>
          <p style="color: #6b7280; font-size: 13px; margin: 4px 0 0;">Interested</p>
        </div>
        <div style="background: #fdf4ff; padding: 20px; border-radius: 10px; text-align: center;">
          <p style="font-size: 32px; font-weight: 700; color: #9333ea; margin: 0;">${stats.bookings}</p>
          <p style="color: #6b7280; font-size: 13px; margin: 4px 0 0;">Bookings</p>
        </div>
      </div>
      <div style="background: #f9fafb; border-radius: 8px; padding: 16px 20px; margin-bottom: 28px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="color: #374151; font-size: 14px; padding: 6px 0;">Connection Rate</td>
            <td style="text-align: right; font-weight: 700; color: #111827;">${stats.connectionRate}%</td>
          </tr>
          <tr>
            <td style="color: #374151; font-size: 14px; padding: 6px 0;">Booking Rate</td>
            <td style="text-align: right; font-weight: 700; color: #111827;">${stats.bookingRate}%</td>
          </tr>
        </table>
      </div>
      ${stats.tomorrowsBookings.length > 0 ? `
      <h3 style="color: #111827; font-size: 16px; margin: 0 0 12px;">Tomorrow's Bookings</h3>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 10px 12px; text-align: left; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Lead</th>
            <th style="padding: 10px 12px; text-align: left; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Time</th>
            <th style="padding: 10px 12px; text-align: left; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Meet</th>
          </tr>
        </thead>
        <tbody>${tomorrowRows}</tbody>
      </table>` : `<p style="color: #9ca3af; font-size: 14px; text-align: center; padding: 16px 0;">No bookings scheduled for tomorrow yet.</p>`}
      <div style="text-align: center; margin-top: 28px;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.jacbuilds.com'}/dashboard"
           style="display: inline-block; background: #1e3a5f; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600;">
          View Full Dashboard →
        </a>
      </div>
    </div>
  </div>
</body>
</html>`,
  });
}

/**
 * Sends the weekly performance report email.
 */
export async function sendWeeklyReport(
  to: string,
  report: WeeklyReportData
): Promise<void> {
  const resend = getResendClient();

  const breakdownRows = report.dailyBreakdown
    .map(
      (d) => `<tr style="border-top: 1px solid #f3f4f6;">
        <td style="padding: 10px 12px; color: #374151;">${d.date}</td>
        <td style="padding: 10px 12px; text-align: right; color: #111827; font-weight: 500;">${d.calls}</td>
        <td style="padding: 10px 12px; text-align: right; color: #059669; font-weight: 500;">${d.bookings}</td>
      </tr>`
    )
    .join("");

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `📈 Weekly Report – ${report.weekRange}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); padding: 32px 40px;">
      <p style="color: rgba(255,255,255,0.6); margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Weekly Report</p>
      <h1 style="color: #ffffff; margin: 4px 0 0; font-size: 22px;">${report.orgName}</h1>
      <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 15px;">${report.weekRange}</p>
    </div>
    <div style="padding: 32px 40px;">
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 28px;">
        <div style="text-align: center; padding: 16px; background: #eff6ff; border-radius: 10px;">
          <p style="font-size: 28px; font-weight: 700; color: #2563eb; margin: 0;">${report.totalLeads}</p>
          <p style="color: #6b7280; font-size: 12px; margin: 4px 0 0;">Leads</p>
        </div>
        <div style="text-align: center; padding: 16px; background: #f0fdf4; border-radius: 10px;">
          <p style="font-size: 28px; font-weight: 700; color: #059669; margin: 0;">${report.totalCalls}</p>
          <p style="color: #6b7280; font-size: 12px; margin: 4px 0 0;">Calls</p>
        </div>
        <div style="text-align: center; padding: 16px; background: #fdf4ff; border-radius: 10px;">
          <p style="font-size: 28px; font-weight: 700; color: #9333ea; margin: 0;">${report.totalBookings}</p>
          <p style="color: #6b7280; font-size: 12px; margin: 4px 0 0;">Bookings</p>
        </div>
      </div>
      <div style="background: #f9fafb; border-radius: 8px; padding: 16px 20px; margin-bottom: 28px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="color: #374151; font-size: 14px; padding: 5px 0;">Connection Rate</td>
            <td style="text-align: right; font-weight: 700; color: #111827;">${report.connectionRate}%</td>
          </tr>
          <tr>
            <td style="color: #374151; font-size: 14px; padding: 5px 0;">Booking Rate</td>
            <td style="text-align: right; font-weight: 700; color: #111827;">${report.bookingRate}%</td>
          </tr>
          <tr>
            <td style="color: #374151; font-size: 14px; padding: 5px 0;">Best Day</td>
            <td style="text-align: right; font-weight: 700; color: #059669;">${report.topPerformingDay}</td>
          </tr>
        </table>
      </div>
      <h3 style="color: #111827; font-size: 16px; margin: 0 0 12px;">Daily Breakdown</h3>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 10px 12px; text-align: left; color: #6b7280; font-size: 12px; text-transform: uppercase;">Date</th>
            <th style="padding: 10px 12px; text-align: right; color: #6b7280; font-size: 12px; text-transform: uppercase;">Calls</th>
            <th style="padding: 10px 12px; text-align: right; color: #6b7280; font-size: 12px; text-transform: uppercase;">Bookings</th>
          </tr>
        </thead>
        <tbody>${breakdownRows}</tbody>
      </table>
      <div style="text-align: center; margin-top: 28px;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.jacbuilds.com'}/dashboard"
           style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600;">
          Open Dashboard →
        </a>
      </div>
    </div>
  </div>
</body>
</html>`,
  });
}

/**
 * Sends a payment failed notification email.
 */
export async function sendPaymentFailedEmail(
  to: string,
  name: string
): Promise<void> {
  const resend = getResendClient();
  const firstName = name.split(" ")[0];

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "⚠️ Action Required: Payment Failed",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; margin: 0; padding: 0;">
  <div style="max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: #dc2626; padding: 32px 40px; text-align: center;">
      <p style="font-size: 40px; margin: 0;">⚠️</p>
      <h1 style="color: #ffffff; margin: 8px 0 0; font-size: 22px;">Payment Failed</h1>
    </div>
    <div style="padding: 36px 40px;">
      <p style="color: #111827; font-size: 17px; font-weight: 600; margin: 0 0 12px;">Hi ${firstName},</p>
      <p style="color: #374151; line-height: 1.6; margin: 0 0 20px;">
        We were unable to process your latest payment for LeadMey. Your account has been flagged as <strong>past due</strong> and calling services may be paused if payment is not resolved within 7 days.
      </p>
      <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 0 0 28px;">
        <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.5;">
          To restore full access, please update your payment method in the billing settings.
        </p>
      </div>
      <div style="text-align: center;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.jacbuilds.com'}/settings/billing"
           style="display: inline-block; background: #dc2626; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600;">
          Update Payment Method →
        </a>
      </div>
      <p style="color: #9ca3af; font-size: 13px; margin: 28px 0 0; text-align: center;">
        Questions? Contact us at <a href="mailto:support@jacbuilds.com" style="color: #2563eb;">support@jacbuilds.com</a>
      </p>
    </div>
  </div>
</body>
</html>`,
  });
}

/**
 * Sends a cancellation confirmation email.
 */
export async function sendCancellationEmail(
  to: string,
  name: string
): Promise<void> {
  const resend = getResendClient();
  const firstName = name.split(" ")[0];

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Your LeadMey subscription has been cancelled",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; margin: 0; padding: 0;">
  <div style="max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: #4b5563; padding: 32px 40px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Subscription Cancelled</h1>
    </div>
    <div style="padding: 36px 40px;">
      <p style="color: #111827; font-size: 17px; font-weight: 600; margin: 0 0 12px;">Hi ${firstName},</p>
      <p style="color: #374151; line-height: 1.6; margin: 0 0 20px;">
        Your LeadMey subscription has been cancelled and all automated calling has been stopped. You'll retain access to your dashboard data, but no new calls or leads will be processed.
      </p>
      <p style="color: #374151; line-height: 1.6; margin: 0 0 28px;">
        We're sorry to see you go. If you cancelled by mistake or would like to reactivate, you can do so anytime from the billing page.
      </p>
      <div style="text-align: center;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.jacbuilds.com'}/settings/billing"
           style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600;">
          Reactivate Subscription →
        </a>
      </div>
      <p style="color: #9ca3af; font-size: 13px; margin: 28px 0 0; text-align: center;">
        Thank you for using LeadMey. We hope to serve you again.
      </p>
    </div>
  </div>
</body>
</html>`,
  });
}
