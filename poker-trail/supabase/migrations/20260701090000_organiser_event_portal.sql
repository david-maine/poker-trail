create table if not exists public.organizer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.organizer_profiles enable row level security;

drop trigger if exists touch_organizer_profiles_updated_at on public.organizer_profiles;
create trigger touch_organizer_profiles_updated_at
before update on public.organizer_profiles
for each row
execute function public.touch_updated_at();

alter table public.events
add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists events_created_by_idx
on public.events (created_by);

drop policy if exists "organisers can read their own profile" on public.organizer_profiles;
create policy "organisers can read their own profile"
on public.organizer_profiles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "organisers can create their own profile" on public.organizer_profiles;
create policy "organisers can create their own profile"
on public.organizer_profiles
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "organisers can update their own profile" on public.organizer_profiles;
create policy "organisers can update their own profile"
on public.organizer_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "organisers can read their own events" on public.events;
create policy "organisers can read their own events"
on public.events
for select
to authenticated
using (created_by = auth.uid());

drop policy if exists "organisers can create their own events" on public.events;
create policy "organisers can create their own events"
on public.events
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "organisers can update their own events" on public.events;
create policy "organisers can update their own events"
on public.events
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

drop policy if exists "organisers can read their own waypoints" on public.waypoints;
create policy "organisers can read their own waypoints"
on public.waypoints
for select
to authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = waypoints.event_id
      and events.created_by = auth.uid()
  )
);

drop policy if exists "organisers can create their own waypoints" on public.waypoints;
create policy "organisers can create their own waypoints"
on public.waypoints
for insert
to authenticated
with check (
  exists (
    select 1
    from public.events
    where events.id = waypoints.event_id
      and events.created_by = auth.uid()
  )
);

drop policy if exists "organisers can update their own waypoints" on public.waypoints;
create policy "organisers can update their own waypoints"
on public.waypoints
for update
to authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = waypoints.event_id
      and events.created_by = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.events
    where events.id = waypoints.event_id
      and events.created_by = auth.uid()
  )
);

drop policy if exists "organisers can delete their own waypoints" on public.waypoints;
create policy "organisers can delete their own waypoints"
on public.waypoints
for delete
to authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = waypoints.event_id
      and events.created_by = auth.uid()
  )
);

drop policy if exists "organisers can read runs for their own events" on public.runs;
create policy "organisers can read runs for their own events"
on public.runs
for select
to authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = runs.event_id
      and events.created_by = auth.uid()
  )
);

grant select, insert, update on public.organizer_profiles to authenticated;
