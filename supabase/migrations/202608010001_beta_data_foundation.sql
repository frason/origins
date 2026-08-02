-- Project Origins private-beta data foundation.
-- Anonymous Supabase users still use the `authenticated` Postgres role, so
-- every row is explicitly owned by auth.uid() and protected by RLS.

create table public.beta_world_backups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  slot text not null default 'current'
    check (char_length(slot) between 1 and 40),
  world_name text not null
    check (char_length(world_name) between 1 and 120),
  seed bigint not null,
  tick bigint not null check (tick >= 0),
  schema_version integer not null check (schema_version > 0),
  app_version text not null check (char_length(app_version) between 1 and 80),
  world_state jsonb not null
    check (pg_column_size(world_state) <= 2097152),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slot)
);

create table public.beta_diagnostic_bundles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  schema_version integer not null check (schema_version > 0),
  app_version text not null check (char_length(app_version) between 1 and 80),
  commit_sha text check (commit_sha is null or char_length(commit_sha) between 7 and 64),
  seed bigint,
  tick bigint check (tick is null or tick >= 0),
  bundle jsonb not null check (pg_column_size(bundle) <= 2097152),
  created_at timestamptz not null default now()
);

create table public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  diagnostic_id uuid references public.beta_diagnostic_bundles (id)
    on delete set null,
  category text not null
    check (category in ('bug', 'confusion', 'balance', 'accessibility', 'other')),
  summary text not null check (char_length(summary) between 1 and 160),
  detail text not null default '' check (char_length(detail) <= 4000),
  page_url text check (page_url is null or char_length(page_url) <= 500),
  created_at timestamptz not null default now()
);

create index beta_world_backups_owner_updated_idx
  on public.beta_world_backups (owner_id, updated_at desc);
create index beta_diagnostic_bundles_owner_created_idx
  on public.beta_diagnostic_bundles (owner_id, created_at desc);
create index beta_feedback_owner_created_idx
  on public.beta_feedback (owner_id, created_at desc);

create function public.set_beta_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.set_beta_updated_at() from public, anon, authenticated;

create trigger beta_world_backups_set_updated_at
before update on public.beta_world_backups
for each row execute function public.set_beta_updated_at();

alter table public.beta_world_backups enable row level security;
alter table public.beta_world_backups force row level security;
alter table public.beta_diagnostic_bundles enable row level security;
alter table public.beta_diagnostic_bundles force row level security;
alter table public.beta_feedback enable row level security;
alter table public.beta_feedback force row level security;

revoke all on table public.beta_world_backups from anon, authenticated;
revoke all on table public.beta_diagnostic_bundles from anon, authenticated;
revoke all on table public.beta_feedback from anon, authenticated;

grant select, insert, update, delete on table public.beta_world_backups to authenticated;
grant select, insert, delete on table public.beta_diagnostic_bundles to authenticated;
grant select, insert, delete on table public.beta_feedback to authenticated;

create policy "Owners can read their world backups"
on public.beta_world_backups for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "Owners can create their world backups"
on public.beta_world_backups for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy "Owners can update their world backups"
on public.beta_world_backups for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "Owners can delete their world backups"
on public.beta_world_backups for delete to authenticated
using ((select auth.uid()) = owner_id);

create policy "Owners can read their diagnostic bundles"
on public.beta_diagnostic_bundles for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "Owners can create their diagnostic bundles"
on public.beta_diagnostic_bundles for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy "Owners can delete their diagnostic bundles"
on public.beta_diagnostic_bundles for delete to authenticated
using ((select auth.uid()) = owner_id);

create policy "Owners can read their feedback"
on public.beta_feedback for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "Owners can create their feedback"
on public.beta_feedback for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and (
    diagnostic_id is null
    or exists (
      select 1
      from public.beta_diagnostic_bundles as diagnostic
      where diagnostic.id = diagnostic_id
        and diagnostic.owner_id = (select auth.uid())
    )
  )
);

create policy "Owners can delete their feedback"
on public.beta_feedback for delete to authenticated
using ((select auth.uid()) = owner_id);

comment on table public.beta_world_backups is
  'Browser-owned beta world backups. Each payload is capped at 2 MiB.';
comment on table public.beta_diagnostic_bundles is
  'Browser-owned diagnostic exports. Each payload is capped at 2 MiB.';
comment on table public.beta_feedback is
  'Private-beta feedback optionally linked to an owner-accessible diagnostic.';
