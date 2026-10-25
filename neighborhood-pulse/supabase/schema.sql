-- Neighborhood Pulse database. Paste this whole file into Supabase → SQL Editor → Run.

-- One row per community area per weekly run. Keeping every week = history for trend charts.
create table if not exists area_snapshots (
  area_number  int  not null check (area_number between 1 and 77),
  collected_on date not null,
  score        int  not null,
  confidence   text not null,
  summary      text not null,
  metrics      jsonb not null default '{}',
  components   jsonb not null default '[]',
  opportunity  jsonb,
  headlines    jsonb not null default '[]',
  primary key (area_number, collected_on)
);

-- A log of each weekly run, including which data sources worked.
create table if not exists collection_runs (
  id      bigint generated always as identity primary key,
  ran_at  timestamptz not null default now(),
  ok      boolean not null,
  sources jsonb not null
);

-- The most recent snapshot for each area.
create or replace view latest_area_snapshots
  with (security_invoker = true) as
  select distinct on (area_number) *
  from area_snapshots
  order by area_number, collected_on desc;

-- Security: nobody can read or write through the public key.
-- Our server code uses the secret service-role key, which bypasses these rules.
alter table area_snapshots  enable row level security;
alter table collection_runs enable row level security;
