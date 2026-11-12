alter table public.events add column lifecycle_managed boolean not null default false;
alter table public.events add column first_published_at timestamptz;
alter table public.events add column expires_at timestamptz;

create table public.event_capacity_tiers (
 capacity integer primary key, amount_cents integer not null check(amount_cents>=0), currency text not null default 'aud'
);
insert into public.event_capacity_tiers(capacity,amount_cents) values (25,0),(50,2900),(100,4900),(250,9900);
alter table public.event_capacity_tiers enable row level security;
create policy "read catalogue" on public.event_capacity_tiers for select to authenticated using(true);
grant select on public.event_capacity_tiers to authenticated,service_role;
create table public.event_purchases (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id),
 target_capacity integer not null references public.event_capacity_tiers(capacity),
 amount_cents integer not null check(amount_cents>0), currency text not null default 'aud',
 status text not null default 'pending' check(status in ('pending','paid','expired','cancelled')),
 stripe_session_id text unique, stripe_payment_intent text unique, checkout_url text, receipt_url text,
 livemode boolean not null, review_required boolean not null default false,
 refunded_cents integer not null default 0, dispute_status text,
 created_at timestamptz not null default now(), paid_at timestamptz
);
create unique index one_pending_event_purchase on public.event_purchases(event_id) where status='pending';
alter table public.event_purchases enable row level security;
create policy "owners read purchases" on public.event_purchases for select to authenticated using (
 exists(select 1 from public.events e where e.id=event_id and e.created_by=auth.uid())
);
grant select on public.event_purchases to authenticated;
grant all on public.event_purchases to service_role;
create table public.billing_webhook_events(id text primary key, received_at timestamptz not null default now());
alter table public.billing_webhook_events enable row level security;
grant all on public.billing_webhook_events to service_role;

create function public.guard_event_lifetime() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' then
   new.lifecycle_managed:=true; new.first_published_at:=null; new.expires_at:=null;
 elsif auth.uid() is not null and not public.is_event_admin() and (
   new.lifecycle_managed is distinct from old.lifecycle_managed or
   new.first_published_at is distinct from old.first_published_at or new.expires_at is distinct from old.expires_at
 ) then raise exception 'Event lifetime cannot be changed by organisers'; end if;
 if tg_op='UPDATE' and old.lifecycle_managed and old.expires_at<=now() and auth.uid() is not null and not public.is_event_admin() then
   raise exception 'Expired events are read-only';
 end if;
 if new.lifecycle_managed and new.status='active' and (tg_op='INSERT' or old.status<>'active') then
   if new.expires_at<=now() or new.ends_at<=now() then raise exception 'This event has expired'; end if;
   if new.first_published_at is null then
     new.first_published_at:=now(); new.expires_at:=now()+interval '30 days';
   end if;
 end if;
 return new;
end $$;
create trigger guard_event_lifetime before insert or update on public.events for each row execute function public.guard_event_lifetime();

create function public.reserve_event_purchase(p_event_id uuid,p_owner uuid,p_capacity integer,p_livemode boolean)
returns public.event_purchases language plpgsql security definer set search_path=public as $$
declare e public.events; purchase public.event_purchases; target integer; current_price integer;
begin
 select * into e from public.events where id=p_event_id for update;
 if not found or e.created_by is distinct from p_owner then raise exception 'Event not found'; end if;
 if e.expires_at<=now() or e.ends_at<=now() or e.status='archived' then raise exception 'This event has expired'; end if;
 if e.player_capacity is null or p_capacity<=e.player_capacity then raise exception 'Choose a larger capacity'; end if;
 select amount_cents into target from public.event_capacity_tiers where capacity=p_capacity;
 select amount_cents into current_price from public.event_capacity_tiers where capacity=e.player_capacity;
 if target is null or current_price is null then raise exception 'Unsupported capacity'; end if;
 select * into purchase from public.event_purchases where event_id=p_event_id and status='pending';
 if found then
   if purchase.target_capacity<>p_capacity or purchase.livemode<>p_livemode then raise exception 'Cancel the outstanding checkout before selecting another tier'; end if;
   return purchase;
 end if;
 insert into public.event_purchases(event_id,target_capacity,amount_cents,livemode)
 values(p_event_id,p_capacity,target-current_price,p_livemode) returning * into purchase;
 return purchase;
end $$;
create function public.fulfil_event_purchase(p_id uuid,p_session text,p_intent text,p_amount integer,p_currency text,p_live boolean,p_receipt text)
returns void language plpgsql security definer set search_path=public as $$
declare purchase public.event_purchases;
begin
 perform 1 from public.events where id=(select event_id from public.event_purchases where id=p_id) for update;
 select * into purchase from public.event_purchases where id=p_id for update;
 if not found or purchase.stripe_session_id is distinct from p_session or purchase.amount_cents<>p_amount
 or purchase.currency<>p_currency or purchase.livemode<>p_live then raise exception 'Payment does not match purchase'; end if;
 if purchase.status='paid' then return; end if;
 update public.event_purchases set status='paid',stripe_payment_intent=p_intent,receipt_url=p_receipt,paid_at=now() where id=p_id;
 update public.events set player_capacity=greatest(player_capacity,purchase.target_capacity) where id=purchase.event_id;
end $$;
revoke all on function public.reserve_event_purchase(uuid,uuid,integer,boolean) from public,anon,authenticated;
revoke all on function public.fulfil_event_purchase(uuid,text,text,integer,text,boolean,text) from public,anon,authenticated;
grant execute on function public.reserve_event_purchase(uuid,uuid,integer,boolean) to service_role;
grant execute on function public.fulfil_event_purchase(uuid,text,text,integer,text,boolean,text) to service_role;

create function public.guard_event_purchase_delete() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.event_purchases where event_id=old.id and (status in ('pending','paid') or paid_at is not null)) then
   raise exception 'Events with payments or outstanding checkout cannot be deleted'; end if;
 delete from public.event_purchases where event_id=old.id;
 return old;
end $$;
create trigger guard_event_purchase_delete before delete on public.events for each row execute function public.guard_event_purchase_delete();
create function public.guard_event_play_window() returns trigger language plpgsql security definer set search_path=public as $$
declare e public.events; event_key uuid;
begin
 if tg_table_name='run_card_claims' then select event_id into event_key from public.runs where id=new.run_id;
 else event_key:=new.event_id; end if;
 select * into e from public.events where id=event_key for share;
 if e.lifecycle_managed and (e.expires_at<=now() or e.ends_at<=now() or e.starts_at>now()) then
   raise exception 'This event is outside its playable window'; end if;
 return new;
end $$;
create trigger guard_run_window before insert or update on public.runs for each row execute function public.guard_event_play_window();
create trigger guard_claim_window before insert on public.run_card_claims for each row execute function public.guard_event_play_window();
create function public.guard_expired_waypoints() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.events where id in (new.event_id,old.event_id) and lifecycle_managed and expires_at<=now()) then
   raise exception 'Expired events are read-only'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger guard_expired_waypoints before insert or update or delete on public.waypoints for each row execute function public.guard_expired_waypoints();

-- SECURITY INVOKER preserves the existing event/waypoint ownership policies.
create or replace function public.create_organiser_event_with_waypoints(p_name text, p_waypoints jsonb)
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
  if jsonb_array_length(p_waypoints) <> 5 then raise exception 'Set all five waypoints'; end if;

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

  insert into public.events (name, slug, status, created_by, player_capacity)
  values (btrim(p_name), 'trail-' || gen_random_uuid()::text, 'draft', auth.uid(), 25)
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

revoke all on function public.create_organiser_event_with_waypoints(text, jsonb) from public;
grant execute on function public.create_organiser_event_with_waypoints(text, jsonb) to authenticated;
