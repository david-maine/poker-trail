-- Accepted claims are immutable. GPS data is private to the player and event staff.
create table public.run_card_claims (
  run_id uuid not null references public.runs(id) on delete cascade,
  waypoint_id uuid not null references public.waypoints(id),
  card text not null,
  claim jsonb not null,
  primary key (run_id, waypoint_id),
  unique (run_id, card)
);
alter table public.run_card_claims enable row level security;
create policy "owners and event staff can read claims" on public.run_card_claims
for select to authenticated using (exists (
  select 1 from public.runs r join public.events e on e.id = r.event_id
  where r.id = run_id and (r.user_id = auth.uid() or e.created_by = auth.uid() or public.is_event_admin())
));
grant select on public.run_card_claims to authenticated;

-- A public revision contains no identities, cards, or location data.
create table public.event_leaderboard_updates (
  event_id uuid primary key references public.events(id) on delete cascade,
  revision bigint not null default 0
);
alter table public.event_leaderboard_updates enable row level security;
create policy "published event revisions are readable" on public.event_leaderboard_updates
for select to anon, authenticated using (exists (
  select 1 from public.events e where e.id = event_id and e.status in ('active', 'closed')
));
grant select on public.event_leaderboard_updates to anon, authenticated;
insert into public.event_leaderboard_updates(event_id) select id from public.events;

create function public.notify_event_leaderboard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.event_leaderboard_updates(event_id, revision)
    values (new.event_id, 1)
    on conflict (event_id) do update set revision = event_leaderboard_updates.revision + 1;
  return new;
end;
$$;
create trigger runs_notify_leaderboard after insert or update on public.runs
for each row execute function public.notify_event_leaderboard();
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'event_leaderboard_updates') then
    alter publication supabase_realtime add table public.event_leaderboard_updates;
  end if;
end $$;

create or replace view public.leaderboard_entries as
select e.id as event_id, e.slug as event_slug, e.name as event_name,
  r.id as run_id, r.user_id,
  coalesce(r.display_name, 'Player ' || left(r.user_id::text, 8)) as player_label,
  r.status as run_status, r.started_at, r.finished_at, r.visit_count,
  r.best_hand_name, r.best_hand_rank, r.best_hand_cards, r.tiebreaker,
  row_number() over (partition by r.event_id order by
    case when r.status = 'completed' then 0 when r.visit_count > 0 then 1 else 2 end,
    r.best_hand_rank desc, r.tiebreaker desc,
    case when r.status = 'completed' then r.finished_at end asc nulls last,
    case when r.status <> 'completed' then r.visit_count end desc,
    r.started_at asc, r.id asc
  ) as leaderboard_rank,
  (select count(*)::integer from public.waypoints w where w.event_id = e.id and w.is_active) as total_waypoints
from public.runs r join public.events e on e.id = r.event_id
where e.status in ('active', 'closed') and
  (r.status = 'completed' or (r.status = 'active' and nullif(btrim(r.display_name), '') is not null));
grant select on public.leaderboard_entries to anon, authenticated;

-- Only the authenticated Edge Function may commit a validated, server-scored snapshot.
create function public.apply_hand_snapshot(p_run_id uuid, p_claims jsonb, p_score jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  current_run public.runs;
  incoming_count integer := jsonb_array_length(p_claims);
  stored_count integer;
  waypoint_count integer;
  last_claim timestamptz;
begin
  select * into current_run from public.runs where id = p_run_id for update;
  if not found then raise exception 'Run not found'; end if;
  if current_run.status = 'abandoned' then raise exception 'Run no longer active'; end if;
  select count(*) into stored_count from public.run_card_claims where run_id = p_run_id;
  -- Legacy completed runs did not retain individual claims. Keep their existing summary.
  if current_run.status = 'completed' and stored_count = 0 then return jsonb_build_object('run', to_jsonb(current_run), 'claims',
    coalesce((select jsonb_agg(claim) from public.run_card_claims where run_id = p_run_id), '[]'::jsonb)); end if;
  if exists (
    select 1 from public.run_card_claims c join jsonb_array_elements(p_claims) v
      on c.waypoint_id = (v->>'waypointId')::uuid
    where c.run_id = p_run_id and c.claim <> v
  ) then raise exception 'Accepted cards cannot be changed' using errcode = 'P0001'; end if;
  if not exists (
    select 1 from jsonb_array_elements(p_claims) v where not exists (
      select 1 from public.run_card_claims c where c.run_id = p_run_id and c.claim = v
    )
  ) then return jsonb_build_object('run', to_jsonb(current_run), 'claims',
    coalesce((select jsonb_agg(claim) from public.run_card_claims where run_id = p_run_id), '[]'::jsonb)); end if;
  if current_run.status = 'completed' then raise exception 'Hand already completed'; end if;
  if exists (
    select 1 from public.run_card_claims c where c.run_id = p_run_id and not exists (
      select 1 from jsonb_array_elements(p_claims) v where v = c.claim
    )
  ) then raise exception 'Hand changed on another device. Restore accepted cards before retrying'; end if;
  select count(*) into waypoint_count from public.waypoints where event_id = current_run.event_id and is_active;
  if incoming_count < 1 or incoming_count > waypoint_count then raise exception 'Invalid claim count'; end if;
  if exists (select 1 from jsonb_array_elements(p_claims) v where not exists (
    select 1 from public.waypoints w where w.id = (v->>'waypointId')::uuid
      and w.event_id = current_run.event_id and w.is_active
  )) then raise exception 'Invalid waypoint'; end if;
  insert into public.run_card_claims(run_id, waypoint_id, card, claim)
    select p_run_id, (v->>'waypointId')::uuid, v->>'card', v from jsonb_array_elements(p_claims) v
    on conflict (run_id, waypoint_id) do nothing;
  select max((v->>'claimedAt')::timestamptz) into last_claim from jsonb_array_elements(p_claims) v;
  update public.runs set
    visit_count = incoming_count, last_claim_at = last_claim,
    status = case when incoming_count = waypoint_count then 'completed' else 'active' end,
    finished_at = case when incoming_count = waypoint_count then coalesce(finished_at, now()) else null end,
    best_hand_name = p_score->>'name', best_hand_rank = (p_score->>'rank')::integer,
    best_hand_cards = array(select jsonb_array_elements_text(p_score->'cards')),
    tiebreaker = array(select jsonb_array_elements_text(p_score->'tiebreaker'))::integer[]
    where id = p_run_id returning * into current_run;
  return jsonb_build_object('run', to_jsonb(current_run), 'claims',
    coalesce((select jsonb_agg(claim) from public.run_card_claims where run_id = p_run_id), '[]'::jsonb));
end;
$$;
revoke all on function public.apply_hand_snapshot(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_hand_snapshot(uuid, jsonb, jsonb) to service_role;

-- Players can register their name but cannot write scores or claim progress directly.
create function public.keep_run_identity() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.event_id is distinct from old.event_id or new.user_id is distinct from old.user_id then
    raise exception 'A run cannot be moved to another event or player';
  end if;
  return new;
end;
$$;
create trigger runs_keep_identity before update of event_id, user_id on public.runs
for each row execute function public.keep_run_identity();
revoke insert, update on public.runs from authenticated;
grant insert (event_id, user_id, display_name), update (event_id, user_id, display_name) on public.runs to authenticated;
