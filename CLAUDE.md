# LeadEmm — Claude Code Context

## What This Is
LeadEmm is a **managed SaaS platform** for AI-powered outbound sales automation. Clients pay one monthly subscription and never interact with any underlying tools. Julian (the operator) holds master accounts with every backend service and manages all client campaigns from env vars and an operator dashboard.

**The client experience is fully abstracted — they see LeadEmm. Nothing else.**

## Local Project Path
`/Users/julianaccola/accolajulian@gmail.com - Google Drive/My Drive/jacbuilds-autopilot/`

GitHub: `github.com/accolajulian/Julian` | Deployed on: Vercel

## Tech Stack
| Layer | Tool |
|---|---|
| Framework | Next.js 16.2.4 (App Router, Turbopack) |
| Auth | Clerk |
| Database | Supabase (PostgreSQL) |
| Payments | Stripe |
| AI Calling | Bland.ai (called "Atlas" in code — `lib/atlas.ts`) |
| Lead Sourcing | Apollo.io (`lib/apollo.ts`) |
| SMS | Twilio (`lib/twilio.ts`) |
| Email | Resend (`lib/resend.ts`) |
| Job Queues | Bull + Redis |
| Calendar | Google Calendar (`lib/calendar.ts`) |
| Script Generation | Anthropic Claude API |
| Hosting | Vercel (frontend + API routes) |

## Business Model
- Julian holds **one master account** with each tool (Bland.ai, Apollo.io, Make.com, Stripe, Anthropic)
- Each client gets a **sub-account / sub-campaign** inside Julian's master accounts
- Clients **never** log into Bland.ai, Apollo, Twilio, or any other tool
- Stripe auto-charges clients monthly → money lands in Webbeyy LLC Bluevine checking

**This means:** API keys for all backend tools live in **environment variables**, not in client records. The onboarding wizard should collect business info, NOT API keys.

## Pricing Tiers
| Tier | Launch Price | Standard | Calls/mo | Key Features |
|---|---|---|---|---|
| Starter | $197/mo | $497/mo | 500 | 1 campaign, email follow-up, basic dashboard |
| Growth | $397/mo | $897/mo | 1,500 | SMS follow-up, lead scoring, CRM pipeline, local spoofing |
| Pro | $697/mo | $1,497/mo | Unlimited | A/B scripts, objection handling, white-label, dedicated support |

## Design System — NON-NEGOTIABLE
- Background: `#0a0a0a` (near-black)
- Card/surface: `#1a1d2e`
- Border: `#2a2d3e`
- Primary accent: `#c8f547` (yellow-green) — use for CTAs and key highlights
- Secondary accent: `#00ff88` (green) — use for live/active indicators
- Info: `#4fc3f7` (blue)
- Muted text: `#6b7280`
- The dashboard should feel like a **live mission control**, not a static report

## Database Schema (Supabase)
Tables: `organizations`, `users`, `targets`, `leads`, `calls`, `bookings`, `notifications`

Every query **must** be scoped to `organization_id` — multi-tenancy is enforced at the query level.

Key status enums:
- leads.status: `new | queued | calling | called | interested | booked | dead`
- calls.outcome: `interested | not_interested | no_answer | voicemail | callback`
- bookings.status: `confirmed | cancelled | completed`

## App Structure
```
app/
  (public)/          # Landing page, pricing, login, signup
  (dashboard)/       # Protected — all client-facing pages
    dashboard/       # Mission control (stats, activity feed, kanban)
    leads/           # Lead pipeline management
    targets/         # Industry/location targeting
    bookings/        # Appointment calendar
    reports/         # Performance reports
    scripts/         # Call script management
    settings/        # Profile, notifications, integrations
    onboarding/      # First-run wizard
lib/
  atlas.ts           # Bland.ai AI calling integration
  apollo.ts          # Apollo.io lead sourcing
  twilio.ts          # SMS
  resend.ts          # Email sequences
  stripe.ts          # Billing
  supabase.ts        # DB client
  calendar.ts        # Google Calendar booking
  types.ts           # All shared TypeScript types
workers/
  callTrigger.ts     # Bull worker: picks up leads, fires Bland.ai calls
  leadPuller.ts      # Bull worker: fetches leads from Apollo.io
  calendarBooker.ts  # Bull worker: books Google Calendar appointments
  dailySummary.ts    # Bull worker: sends nightly report emails
```

## What Is Built
- Full dashboard UI (stats cards, activity feed, kanban pipeline)
- Onboarding wizard (multi-step — needs business-info-only refactor)
- Leads, targets, bookings, reports, scripts, settings pages
- All API routes (leads, targets, bookings, automation, billing, webhooks)
- Bull/Redis job queue workers for all automation
- Stripe checkout + subscription webhooks
- Clerk authentication + org middleware
- Apollo.io lead search
- Bland.ai (Atlas) call initiation + webhook handling
- Google Calendar booking
- Twilio SMS + Resend email

## What Needs Work / Known Gaps
1. **Onboarding wizard** — currently asks clients for `apolloKey` / `atlasKey`. Must change: Julian's keys live in env vars. Onboarding should only collect business name, website URL, industry, location, campaign goal.
2. **Script generation** — Claude API integration needs to be wired into onboarding (read website URL → generate custom call script).
3. **Lead scoring** — Bland.ai webhook returns call outcome; need to translate to a 1–10 score and store it on the lead.
4. **Real-time dashboard** — Socket.io is installed but needs to be wired to push live call/lead events.
5. **Stripe webhook → auto-provision** — on `checkout.session.completed`, should auto-create org, provision first campaign, trigger lead pull.
6. **A/B script testing** — Pro tier only, not yet built.
7. **Pricing page** — Pro tier shows $597, should be $697 to match the pricing doc.

## Important Rules
- Every user-facing feature should behave as if the underlying tools do not exist
- All DB queries scoped to `organization_id`
- Calling hours enforced: only dial between 8AM–8PM in org's timezone
- Plan limits enforced before any lead pull or call trigger
- Dark theme enforced everywhere — no light mode
- Accent color in code is `#00ff88`; the spec says `#c8f547` for CTAs — use `#c8f547` for primary buttons and `#00ff88` for live/status indicators

## Key Environment Variables Needed
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ATLAS_API_KEY          # Bland.ai API key (Julian's master key)
ATLAS_API_BASE_URL     # Bland.ai base URL
APOLLO_API_KEY         # Apollo.io (Julian's master key)
ANTHROPIC_API_KEY      # Claude API for script generation
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
REDIS_URL
NEXT_PUBLIC_APP_URL
```
