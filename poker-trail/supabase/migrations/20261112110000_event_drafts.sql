-- Desired size is a draft preference; paid capacity remains server-controlled.
alter table public.events add column requested_capacity integer references public.event_capacity_tiers(capacity);
create function public.guard_requested_capacity() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='active' and new.requested_capacity > new.player_capacity then
   raise exception 'Complete payment for the selected capacity before publishing';
 end if;
 return new;
end $$;
create trigger guard_requested_capacity before insert or update on public.events for each row execute function public.guard_requested_capacity();
create or replace function public.create_organiser_event_draft(p_name text, p_waypoints jsonb, p_capacity integer default 25)
returns public.events
language plpgsql security invoker set search_path = public as $$
declare
  created_event public.events;
  point jsonb;
  slot integer;
  lat double precision;
  lng double precision;
  radius_value numeric;
  seen integer[] := '{}';
begin
  if auth.uid() is null or not exists (select 1 from public.organizer_profiles where user_id = auth.uid()) then
    raise exception 'Sign in with an organiser account to create an event';
  end if;
  if p_name is null or char_length(btrim(p_name)) = 0 then raise exception 'Event name is required'; end if;
  if p_waypoints is null or jsonb_typeof(p_waypoints) <> 'array' then raise exception 'Set all five waypoints'; end if;
  if jsonb_array_length(p_waypoints) > 5 then raise exception 'At most five waypoints are allowed'; end if;
  if p_capacity is null or not exists(select 1 from public.event_capacity_tiers where capacity=p_capacity) then raise exception 'Unsupported capacity'; end if;

  -- Validate the entire payload before any write. Numeric types exclude blanks/nulls.
  for point in select value from jsonb_array_elements(p_waypoints) loop
    if jsonb_typeof(point->'slot_index') is distinct from 'number'
      or jsonb_typeof(point->'latitude') is distinct from 'number'
      or jsonb_typeof(point->'longitude') is distinct from 'number'
      or jsonb_typeof(point->'radius_meters') is distinct from 'number' then
      raise exception 'Waypoint coordinates and radius must be valid numbers';
    end if;
    if (point->>'slot_index')::numeric <> trunc((point->>'slot_index')::numeric) then raise exception 'Invalid waypoint slot'; end if;
    slot := (point->>'slot_index')::integer;
    lat := (point->>'latitude')::double precision;
    lng := (point->>'longitude')::double precision;
    radius_value := (point->>'radius_meters')::numeric;
    if slot not between 0 and 4 or slot = any(seen) then raise exception 'Set five distinct waypoint slots'; end if;
    if not (lat between -90 and 90 and lng between -180 and 180)
      or radius_value <> trunc(radius_value) or radius_value not between 1 and 2147483647 then
      raise exception 'Waypoint coordinates or radius are invalid';
    end if;
    seen := array_append(seen, slot);
  end loop;

  insert into public.events (name, slug, status, created_by, player_capacity, requested_capacity)
  values (btrim(p_name), 'trail-' || gen_random_uuid()::text, 'draft', auth.uid(), 25, p_capacity)
  returning * into created_event;
  for point in select value from jsonb_array_elements(p_waypoints) loop
    slot := (point->>'slot_index')::integer;
    insert into public.waypoints (event_id, code, name, latitude, longitude, radius_meters, sort_order, proof_type, is_active)
    values (created_event.id, 'wp' || (slot + 1), 'Waypoint ' || (slot + 1),
      (point->>'latitude')::double precision, (point->>'longitude')::double precision,
      (point->>'radius_meters')::integer, slot, 'gps', true);
  end loop;
  -- Publish explicitly after capacity selection and payment.
  return created_event;
end;
$$;

revoke all on function public.create_organiser_event_draft(text, jsonb, integer) from public;
grant execute on function public.create_organiser_event_draft(text, jsonb, integer) to authenticated;
