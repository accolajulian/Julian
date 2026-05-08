import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import Bull from "bull";
import { Resend } from "resend";
import { generateCallScript } from "@/lib/claude";

// ─── Queue factory ────────────────────────────────────────────────────────────

function getLeadPullQueue() {
  return new Bull("lead-pull", {
    redis: process.env.REDIS_URL ?? "redis://localhost:6379",
  });
}

// ─── POST /api/onboarding/complete ───────────────────────────────────────────
// Marks onboarding as complete, creates the first lead-pull job, and
// sends a welcome email via Resend.

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServerClient();

    // 1. Resolve org
    const { data: userRecord } = await supabase
      .from("users")
      .select("organization_id, email, full_name")
      .eq("clerk_id", userId)
      .single() as { data: { organization_id: string; email: string; full_name: string } | null };

    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const orgId = userRecord.organization_id;

    // 2. Load org details
    const { data: org } = await supabase
      .from("organizations")
      .select("name, plan, settings, leads_used_this_month, avg_job_value")
      .eq("id", orgId)
      .single() as { data: { name: string; plan: string; settings: Record<string, unknown>; leads_used_this_month: number; avg_job_value: number | null } | null };

    // 3. Create target from onboarding settings if none exists yet
    const settings = (org?.settings ?? {}) as Record<string, unknown>;
    const industry = settings.onboarding_industry as string | undefined;
    const county = settings.onboarding_county as string | undefined;
    const state = settings.onboarding_state as string | undefined;
    const scriptChoice = settings.onboarding_script_choice as string | undefined;
    const customScript = settings.onboarding_custom_script as string | undefined;

    const { data: existingTargets } = await supabase
      .from("targets")
      .select("id")
      .eq("organization_id", orgId)
      .limit(1);

    let firstTargetId: string | null =
      (existingTargets as Array<{ id: string }> | null)?.[0]?.id ?? null;

    if (!firstTargetId && industry && state) {
      // Generate AI call script if requested
      let resolvedScript: string | null = null;
      if (scriptChoice === "custom" && customScript) {
        resolvedScript = customScript;
      } else if (scriptChoice === "ai" || !scriptChoice) {
        try {
          resolvedScript = await generateCallScript({
            businessName: org?.name ?? "our company",
            industry,
            locationCounty: county,
            locationState: state,
            websiteUrl: (settings.website_url as string | undefined) ?? undefined,
            avgJobValue: org?.avg_job_value ?? undefined,
          });
        } catch (scriptErr) {
          console.warn("[onboarding/complete] Script generation failed:", scriptErr);
        }
      }

      const { data: newTarget } = await supabase
        .from("targets")
        .insert({
          organization_id: orgId,
          industry,
          location_county: county ?? "",
          location_state: state,
          active: true,
          call_script: resolvedScript,
        } as never)
        .select("id")
        .single() as { data: { id: string } | null };

      firstTargetId = newTarget?.id ?? null;
    }

    // 4. Mark onboarding complete on org
    await supabase
      .from("organizations")
      .update({
        settings: {
          ...settings,
          onboarding_completed: true,
          onboarding_completed_at: new Date().toISOString(),
        },
      } as never)
      .eq("id", orgId);

    // 5. Queue first lead-pull job
    let jobId: string | number | null = null;
    try {
      const queue = getLeadPullQueue();
      const job = await queue.add(
        {
          organizationId: orgId,
          targetId: firstTargetId,
          count: 25,
          trigger: "onboarding_complete",
        },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: true,
          delay: 5000, // slight delay to let DB settle
        }
      );
      jobId = job.id;
    } catch (queueErr) {
      // Non-fatal — log but continue
      console.warn("[onboarding/complete] Could not queue lead-pull job:", queueErr);
    }

    // 6. Send welcome email via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && userRecord.email) {
      try {
        const resend = new Resend(resendKey);
        const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@jacbuildsautopilot.com";
        const ownerName = userRecord.full_name?.split(" ")[0] ?? "there";
        const orgName = org?.name ?? "your business";

        await resend.emails.send({
          from: `LeadEmm <${fromEmail}>`,
          to: [userRecord.email],
          subject: "🚀 LeadEmm is live — your first leads are being pulled now",
          html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to LeadEmm</title>
</head>
<body style="margin:0;padding:0;background-color:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#1a1d2e;border:1px solid #2a2d3e;border-radius:16px;overflow:hidden;max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#00ff88 0%,#00cc70 100%);padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:13px;font-weight:700;color:#0f1117;letter-spacing:2px;text-transform:uppercase;">LeadEmm</p>
              <h1 style="margin:8px 0 0;font-size:28px;font-weight:900;color:#0f1117;">You&rsquo;re live. 🚀</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 16px;font-size:16px;color:#ffffff;line-height:1.6;">
                Hey ${ownerName},
              </p>
              <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.6;">
                Congratulations — <strong style="color:#ffffff;">${orgName}</strong> is now running on LeadEmm.
                Your first batch of leads is being pulled right now and calls will start within the next few hours.
              </p>

              <!-- Steps summary -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f1117;border:1px solid #2a2d3e;border-radius:12px;overflow:hidden;margin:24px 0;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">What happens next</p>
                    ${[
                      ["Leads pulled from Apollo.io", "In progress"],
                      ["AI calls begin (Atlas AI)", "Next few hours"],
                      ["First bookings land in calendar", "Within 48–72 hours"],
                    ]
                      .map(
                        ([label, status]) => `
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
                      <tr>
                        <td style="font-size:13px;color:#ffffff;">${label}</td>
                        <td align="right" style="font-size:12px;color:#00ff88;font-weight:600;">${status}</td>
                      </tr>
                    </table>`
                      )
                      .join("")}
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px;font-size:14px;color:#9ca3af;line-height:1.6;">
                Head to your dashboard at any time to monitor calls, leads, and bookings in real time.
              </p>

              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#00ff88;border-radius:10px;padding:14px 28px;">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.jacbuildsautopilot.com"}/dashboard"
                       style="font-size:14px;font-weight:800;color:#0f1117;text-decoration:none;display:block;">
                      View Your Dashboard →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top:1px solid #2a2d3e;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#4b5563;">
                LeadEmm &bull; Questions? Reply to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
          `.trim(),
        });
      } catch (emailErr) {
        console.warn("[onboarding/complete] Could not send welcome email:", emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      jobId,
      message: "LeadEmm is live. Your first leads are being pulled.",
    });
  } catch (err) {
    console.error("[POST /api/onboarding/complete]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
