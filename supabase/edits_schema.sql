-- ============================================================
-- Edits — schema + Row Level Security policies
-- Run this in the Supabase SQL editor (same project as LeadEmm —
-- tables are prefixed edits_ so nothing collides).
-- ============================================================

create extension if not exists "pgcrypto";

-- ─── PROJECTS ─────────────────────────────────────────────────────────────
create table if not exists edits_projects (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null references auth.users(id) on delete cascade,
  name                       text not null default 'Untitled project',
  audio_path                 text,        -- path inside the edits-audio storage bucket
  audio_filename             text,        -- original filename, shown in the UI
  countdown_seconds          integer not null default 3 check (countdown_seconds between 0 and 10),
  countdown_enabled          boolean not null default true,
  countdown_in_edit_preview  boolean not null default true,
  lyrics_raw                 text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists edits_projects_user_id_idx on edits_projects(user_id);

-- ─── CUTS ─────────────────────────────────────────────────────────────────
create table if not exists edits_cuts (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references edits_projects(id) on delete cascade,
  start_time  numeric not null,
  end_time    numeric not null,
  label       text not null default '',
  note        text not null default '',
  color       text not null default '#F2540B',
  shot        boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint edits_cuts_valid_range check (end_time > start_time)
);

create index if not exists edits_cuts_project_id_idx on edits_cuts(project_id);

-- ─── LYRIC LINES ──────────────────────────────────────────────────────────
create table if not exists edits_lyric_lines (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references edits_projects(id) on delete cascade,
  text        text not null default '',
  time        numeric,          -- null until synced
  sort_order  integer not null default 0
);

create index if not exists edits_lyric_lines_project_id_idx on edits_lyric_lines(project_id);

-- ─── updated_at trigger ───────────────────────────────────────────────────
create or replace function edits_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists edits_projects_set_updated_at on edits_projects;
create trigger edits_projects_set_updated_at
  before update on edits_projects
  for each row execute function edits_set_updated_at();

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────
alter table edits_projects enable row level security;
alter table edits_cuts enable row level security;
alter table edits_lyric_lines enable row level security;

-- Projects: a user can only see/change their own rows.
drop policy if exists "edits_projects_select_own" on edits_projects;
create policy "edits_projects_select_own" on edits_projects
  for select using (auth.uid() = user_id);

drop policy if exists "edits_projects_insert_own" on edits_projects;
create policy "edits_projects_insert_own" on edits_projects
  for insert with check (auth.uid() = user_id);

drop policy if exists "edits_projects_update_own" on edits_projects;
create policy "edits_projects_update_own" on edits_projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "edits_projects_delete_own" on edits_projects;
create policy "edits_projects_delete_own" on edits_projects
  for delete using (auth.uid() = user_id);

-- Cuts / lyric lines: scoped through the parent project's user_id.
drop policy if exists "edits_cuts_all_own" on edits_cuts;
create policy "edits_cuts_all_own" on edits_cuts
  for all using (
    exists (select 1 from edits_projects p where p.id = project_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from edits_projects p where p.id = project_id and p.user_id = auth.uid())
  );

drop policy if exists "edits_lyric_lines_all_own" on edits_lyric_lines;
create policy "edits_lyric_lines_all_own" on edits_lyric_lines
  for all using (
    exists (select 1 from edits_projects p where p.id = project_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from edits_projects p where p.id = project_id and p.user_id = auth.uid())
  );

-- ─── STORAGE: private bucket for uploaded songs ────────────────────────────
insert into storage.buckets (id, name, public)
values ('edits-audio', 'edits-audio', false)
on conflict (id) do nothing;

-- Files must be uploaded under a path starting with the owner's user id,
-- e.g. `${user.id}/${project.id}/${filename}` — enforced below.
drop policy if exists "edits_audio_select_own" on storage.objects;
create policy "edits_audio_select_own" on storage.objects
  for select using (
    bucket_id = 'edits-audio' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "edits_audio_insert_own" on storage.objects;
create policy "edits_audio_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'edits-audio' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "edits_audio_update_own" on storage.objects;
create policy "edits_audio_update_own" on storage.objects
  for update using (
    bucket_id = 'edits-audio' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "edits_audio_delete_own" on storage.objects;
create policy "edits_audio_delete_own" on storage.objects
  for delete using (
    bucket_id = 'edits-audio' and auth.uid()::text = (storage.foldername(name))[1]
  );
