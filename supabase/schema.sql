-- ============================================================
-- JACBuilds AutoPilot — Supabase PostgreSQL Schema
-- Run this in the Supabase SQL editor to create all tables,
-- indexes, and Row Level Security policies.
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─── ORGANIZATIONS ────────────────────────────────────────────────────────────
create table if not exists organizations (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  owner_email           text not null,
  plan                  text not null default 'starter' check (plan in ('starter','growth','pro')),
  stripe_customer_id    text unique,
  stripe_subscription_id text unique,
  subscription_status   text not null default 'inactive' check (subscription_status in ('active','past_due','cancelled','inactive')),
  setup_fee_paid        boolean not null default false,
  onboarding_complete   boolean not null default false,
  avg_job_value         integer not null default 500,        -- dollars, used for revenue calc
  working_hours_start   integer not null default 8,          -- 24-hour int (8 = 8AM)
  working_hours_end     integer not null default 20,         -- 24-hour int (20 = 8PM)
  timezone              text not null default 'America/Chicago',
  leads_used_this_month integer not null default 0,
  notification_email    boolean not null default true,
  notification_sms      boolean not null default false,
  notification_daily    boolean not null default true,
  notification_weekly   boolean not null default true,
  summary_send_hour     integer not null default 18,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ─── USERS ────────────────────────────────────────────────────────────────────
create table if not exists users (
  id              uuid primary key default gen_random_uuid(),
  clerk_id        text unique not null,
  organization_id uuid references organizations(id) on delete cascade,
  email           text not null,
  name            text not null default '',
  role            text not null default 'member' check (role in ('owner','member')),
  created_at      timestamptz not null default now()
);

-- ─── TARGETS ──────────────────────────────────────────────────────────────────
create table if not exists targets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  industry        text not null,
  location_county text not null,
  location_state  text not null,
  active          boolean not null default true,
  leads_pulled    integer not null default 0,
  call_script     text,                               -- custom script override
  created_at      timestamptz not null default now()
);

-- ─── LEADS ────────────────────────────────────────────────────────────────────
create table if not exists leads (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  target_id       uuid references targets(id) on delete set null,
  business_name   text not null,
  owner_name      text not null default '',
  phone           text not null default '',
  email           text not null default '',
  industry        text not null default '',
  town            text not null default '',
  status          text not null default 'new' check (status in ('new','queued','calling','called','interested','booked','dead')),
  apollo_id       text unique,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists leads_org_status on leads(organization_id, status);
create index if not exists leads_org_created on leads(organization_id, created_at desc);

-- ─── CALLS ────────────────────────────────────────────────────────────────────
create table if not exists calls (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references organizations(id) on delete cascade,
  lead_id                uuid not null references leads(id) on delete cascade,
  atlas_call_id          text unique,
  outcome                text check (outcome in ('interested','not_interested','no_answer','voicemail','callback')),
  preferred_callback_time timestamptz,
  notes                  text,
  duration_seconds       integer,
  called_at              timestamptz not null default now()
);

create index if not exists calls_org_lead on calls(organization_id, lead_id);
create index if not exists calls_called_at on calls(called_at desc);

-- ─── BOOKINGS ─────────────────────────────────────────────────────────────────
create table if not exists bookings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  lead_id         uuid not null references leads(id) on delete cascade,
  call_id         uuid references calls(id) on delete set null,
  google_event_id text unique,
  meet_link       text,
  scheduled_at    timestamptz not null,
  status          text not null default 'confirmed' check (status in ('confirmed','cancelled','completed')),
  created_at      timestamptz not null default now()
);

create index if not exists bookings_org_scheduled on bookings(organization_id, scheduled_at);

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
create table if not exists notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  type            text not null check (type in ('booking','lead','call','report','system')),
  message         text not null,
  read            boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists notifications_org_read on notifications(organization_id, read, created_at desc);

-- ─── API KEYS (encrypted values) ─────────────────────────────────────────────
create table if not exists api_keys (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null unique references organizations(id) on delete cascade,
  apollo_api_key        text,         -- AES-256 encrypted
  atlas_api_key         text,         -- AES-256 encrypted
  google_refresh_token  text,         -- AES-256 encrypted
  google_calendar_id    text,
  twilio_account_sid    text,         -- AES-256 encrypted
  twilio_auth_token     text,         -- AES-256 encrypted
  twilio_phone_number   text,
  my_phone_number       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ─── UPDATED_AT TRIGGERS ──────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_updated_at
  before update on organizations
  for each row execute procedure set_updated_at();

create trigger leads_updated_at
  before update on leads
  for each row execute procedure set_updated_at();

create trigger api_keys_updated_at
  before update on api_keys
  for each row execute procedure set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- Every authenticated user can only see their own org's data.
-- Service role (used by API routes) bypasses RLS.
-- ============================================================

alter table organizations    enable row level security;
alter table users            enable row level security;
alter table targets          enable row level security;
alter table leads            enable row level security;
alter table calls            enable row level security;
alter table bookings         enable row level security;
alter table notifications    enable row level security;
alter table api_keys         enable row level security;

-- Helper: returns the organization_id for the currently authenticated user
create or replace function current_org_id()
returns uuid language sql security definer as $$
  select organization_id from users where clerk_id = auth.uid()::text limit 1;
$$;

-- organizations: owner or member can read their own org
create policy "org_select" on organizations
  for select using (id = current_org_id());

create policy "org_update" on organizations
  for update using (id = current_org_id());

-- users: can read users in same org
create policy "users_select" on users
  for select using (organization_id = current_org_id());

create policy "users_insert" on users
  for insert with check (organization_id = current_org_id());

create policy "users_delete" on users
  for delete using (organization_id = current_org_id());

-- targets
create policy "targets_select" on targets
  for select using (organization_id = current_org_id());

create policy "targets_insert" on targets
  for insert with check (organization_id = current_org_id());

create policy "targets_update" on targets
  for update using (organization_id = current_org_id());

create policy "targets_delete" on targets
  for delete using (organization_id = current_org_id());

-- leads
create policy "leads_select" on leads
  for select using (organization_id = current_org_id());

create policy "leads_insert" on leads
  for insert with check (organization_id = current_org_id());

create policy "leads_update" on leads
  for update using (organization_id = current_org_id());

create policy "leads_delete" on leads
  for delete using (organization_id = current_org_id());

-- calls
create policy "calls_select" on calls
  for select using (organization_id = current_org_id());

create policy "calls_insert" on calls
  for insert with check (organization_id = current_org_id());

-- bookings
create policy "bookings_select" on bookings
  for select using (organization_id = current_org_id());

create policy "bookings_insert" on bookings
  for insert with check (organization_id = current_org_id());

create policy "bookings_update" on bookings
  for update using (organization_id = current_org_id());

-- notifications
create policy "notifications_select" on notifications
  for select using (organization_id = current_org_id());

create policy "notifications_insert" on notifications
  for insert with check (organization_id = current_org_id());

create policy "notifications_update" on notifications
  for update using (organization_id = current_org_id());

-- api_keys
create policy "api_keys_select" on api_keys
  for select using (organization_id = current_org_id());

create policy "api_keys_insert" on api_keys
  for insert with check (organization_id = current_org_id());

create policy "api_keys_update" on api_keys
  for update using (organization_id = current_org_id());
