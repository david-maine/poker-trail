-- NULL preserves unlimited capacity for existing events and the platform admin.
alter table public.events add column player_capacity integer check (player_capacity > 0);

create function public.guard_organiser_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_event_admin() then return new; end if;
  if tg_op = 'INSERT' then
    if new.created_by is distinct from auth.uid() or new.status <> 'draft' then
      raise exception 'Organiser events must start as owned drafts';
    end if;
    if new.player_capacity is not null and new.player_capacity <> 25 then
      raise exception 'Only the free 25-player tier is available';
    end if;
    new.player_capacity := 25;
  else
    if new.created_by is distinct from old.created_by or new.player_capacity is distinct from old.player_capacity then
      raise exception 'Event ownership and capacity cannot be changed by organisers';
    end if;
    if new.status is distinct from old.status then
      if not (old.status in ('draft','closed') and new.status = 'active'
        or old.status = 'active' and new.status = 'closed') then
        raise exception 'Unsupported event status change';
      end if;
      if new.status = 'active' and (
        char_length(btrim(new.name)) = 0 or
        (select count(*) from public.waypoints where event_id = new.id and is_active
          and sort_order between 0 and 4 and proof_type = 'gps'
          and latitude between -90 and 90 and longitude between -180 and 180) <> 5
      ) then raise exception 'Save five valid GPS waypoints before publishing'; end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_organiser_event before insert or update on public.events
for each row execute function public.guard_organiser_event();

create function public.guard_event_registration() returns trigger
language plpgsql security definer set search_path = public as $$
declare capacity integer; event_status text;
begin
  if tg_op = 'UPDATE' then
    if new.event_id is distinct from old.event_id or new.user_id is distinct from old.user_id then
      raise exception 'Run identity cannot be changed';
    end if;
    return new;
  end if;
  -- Serialize registrations per event, including simultaneous last-slot attempts.
  select player_capacity, status into capacity, event_status from public.events where id = new.event_id for update;
  -- An upsert for an already registered player must still work at capacity.
  if exists (select 1 from public.runs where event_id = new.event_id and user_id = new.user_id) then return new; end if;
  if capacity is not null then
    if event_status <> 'active' then raise exception 'This event is not open for registration'; end if;
    if (select count(*) from public.runs where event_id = new.event_id) >= capacity then
      raise exception 'This event has reached its player capacity';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_event_registration before insert or update on public.runs
for each row execute function public.guard_event_registration();
