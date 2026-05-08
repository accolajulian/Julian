-- ============================================================
-- LeadEmm — Schema Migration
-- Run this in Supabase SQL Editor to bring the DB in sync
-- with the current codebase. Safe to run on a fresh DB too.
-- ============================================================

-- ─── ORGANIZATIONS ────────────────────────────────────────────────────────────
-- Add settings JSONB (stores onboarding data, website_url, script choices, etc.)
alter table organizations
  add column if not exists settings jsonb not null default '{}';

-- Rename stripe_setup_fee_paid if it exists under old name setup_fee_paid
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name='organizations' and column_name='setup_fee_paid'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name='organizations' and column_name='stripe_setup_fee_paid'
  ) then
    alter table organizations rename column setup_fee_paid to stripe_setup_fee_paid;
  end if;
end $$;

alter table organizations
  add column if not exists stripe_setup_fee_paid boolean not null default false;

-- ─── USERS ────────────────────────────────────────────────────────────────────
-- Code queries by clerk_id; schema already uses clerk_id — nothing to change.
-- Add full_name column (onboarding/complete selects it)
alter table users
  add column if not exists full_name text not null default '';

-- ─── TARGETS ──────────────────────────────────────────────────────────────────
-- Add settings JSONB (stores script_b for A/B testing)
alter table targets
  add column if not exists settings jsonb not null default '{}';

-- ─── LEADS ────────────────────────────────────────────────────────────────────
-- The code (apollo.ts formatApolloLead) writes these fields; add them if missing.
alter table leads
  add column if not exists first_name   text not null default '';
alter table leads
  add column if not exists last_name    text not null default '';
alter table leads
  add column if not exists full_name    text not null default '';
alter table leads
  add column if not exists company      text;
alter table leads
  add column if not exists title        text;
alter table leads
  add column if not exists linkedin_url text;
alter table leads
  add column if not exists website      text;
alter table leads
  add column if not exists call_attempts integer not null default 0;
alter table leads
  add column if not exists last_called_at timestamptz;
alter table leads
  add column if not exists next_call_at   timestamptz;
alter table leads
  add column if not exists custom_fields  jsonb not null default '{}';

-- Score from Gap #3
alter table leads
  add column if not exists score smallint;

-- ─── CALLS ────────────────────────────────────────────────────────────────────
-- The atlas webhook and callTrigger worker write many fields the original
-- schema didn't have.
alter table calls
  add column if not exists target_id      uuid references targets(id) on delete set null;
alter table calls
  add column if not exists twilio_call_sid text unique; -- stores Atlas call_id for webhook lookup
alter table calls
  add column if not exists direction      text not null default 'outbound';
alter table calls
  add column if not exists status         text not null default 'initiated';
alter table calls
  add column if not exists transcript     text;
alter table calls
  add column if not exists recording_url  text;
alter table calls
  add column if not exists ai_summary     text;
alter table calls
  add column if not exists sentiment      text;
alter table calls
  add column if not exists started_at     timestamptz;
alter table calls
  add column if not exists ended_at       timestamptz;

-- Script variant from Gap #6 (A/B testing)
alter table calls
  add column if not exists script_variant varchar(1);

-- Rename atlas_call_id → twilio_call_sid if the old column exists and new one doesn't
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name='calls' and column_name='atlas_call_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name='calls' and column_name='twilio_call_sid'
  ) then
    alter table calls rename column atlas_call_id to twilio_call_sid;
  end if;
end $$;

-- Rename called_at → started_at if old column exists
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name='calls' and column_name='called_at'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name='calls' and column_name='started_at'
  ) then
    alter table calls rename column called_at to started_at;
  end if;
end $$;

-- Expand outcome enum to include all values the code uses
alter table calls
  drop constraint if exists calls_outcome_check;
alter table calls
  add constraint calls_outcome_check check (
    outcome is null or outcome in (
      'interested','not_interested','no_answer','voicemail',
      'callback_requested','booked','wrong_number','do_not_call'
    )
  );

-- ─── BOOKINGS ─────────────────────────────────────────────────────────────────
alter table bookings
  add column if not exists target_id          uuid references targets(id) on delete set null;
alter table bookings
  add column if not exists title              text not null default 'Consultation';
alter table bookings
  add column if not exists description        text;
alter table bookings
  add column if not exists duration_minutes   integer not null default 30;
alter table bookings
  add column if not exists timezone           text not null default 'America/New_York';
alter table bookings
  add column if not exists calendar_event_id  text;
alter table bookings
  add column if not exists calendar_provider  text not null default 'google';
alter table bookings
  add column if not exists cancelled_at       timestamptz;
alter table bookings
  add column if not exists cancellation_reason text;
alter table bookings
  add column if not exists updated_at         timestamptz not null default now();

-- Rename google_event_id → calendar_event_id
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name='bookings' and column_name='google_event_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name='bookings' and column_name='calendar_event_id'
  ) then
    alter table bookings rename column google_event_id to calendar_event_id;
  end if;
end $$;

-- Expand bookings status to include rescheduled and no_show
alter table bookings
  drop constraint if exists bookings_status_check;
alter table bookings
  add constraint bookings_status_check check (
    status in ('confirmed','cancelled','completed','rescheduled','no_show')
  );

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
alter table notifications
  add column if not exists user_id    uuid references users(id) on delete set null;
alter table notifications
  add column if not exists title      text not null default '';
alter table notifications
  add column if not exists action_url text;
alter table notifications
  add column if not exists is_read    boolean not null default false;
alter table notifications
  add column if not exists metadata   jsonb not null default '{}';
alter table notifications
  add column if not exists updated_at timestamptz not null default now();

-- Rename read → is_read if old column exists
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name='notifications' and column_name='read'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name='notifications' and column_name='is_read'
  ) then
    alter table notifications rename column read to is_read;
  end if;
end $$;

-- Expand notifications type enum
alter table notifications
  drop constraint if exists notifications_type_check;
alter table notifications
  add constraint notifications_type_check check (
    type in ('booking','lead','call','call_completed','report','system')
  );

-- ─── TRIGGERS ─────────────────────────────────────────────────────────────────
-- Extend set_updated_at trigger to new tables
do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'bookings_updated_at'
  ) then
    create trigger bookings_updated_at
      before update on bookings
      for each row execute procedure set_updated_at();
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'notifications_updated_at'
  ) then
    create trigger notifications_updated_at
      before update on notifications
      for each row execute procedure set_updated_at();
  end if;
end $$;

-- ─── INDEXES ──────────────────────────────────────────────────────────────────
create index if not exists calls_org_target on calls(organization_id, target_id);
create index if not exists calls_script_variant on calls(organization_id, target_id, script_variant)
  where script_variant is not null;
create index if not exists leads_score on leads(organization_id, score desc)
  where score is not null;
