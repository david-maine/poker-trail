-- Existing checkout sessions retain their original capacity-only contract.
alter table public.event_purchases add column publish_on_payment boolean not null default false;
create function public.event_route_ready(p_event_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.events e where e.id=p_event_id and char_length(btrim(e.name))>0)
 and (select count(*) from public.waypoints where event_id=p_event_id and is_active
 and sort_order between 0 and 4 and proof_type='gps' and latitude between -90 and 90
 and longitude between -180 and 180 and radius_meters>0)=5
$$;
revoke all on function public.event_route_ready(uuid) from public,anon,authenticated;
grant execute on function public.event_route_ready(uuid) to service_role;
create or replace function public.reserve_event_purchase(p_event_id uuid,p_owner uuid,p_capacity integer,p_livemode boolean)
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
 if e.status='draft' and not public.event_route_ready(p_event_id) then raise exception 'Save five valid GPS waypoints before Pay & publish'; end if;
 select * into purchase from public.event_purchases where event_id=p_event_id and status='pending';
 if found then
   if purchase.target_capacity<>p_capacity or purchase.livemode<>p_livemode then raise exception 'Cancel the outstanding checkout before selecting another tier'; end if;
   return purchase;
 end if;
 if e.status='draft' then update public.events set requested_capacity=p_capacity where id=p_event_id; end if;
 insert into public.event_purchases(event_id,target_capacity,amount_cents,livemode,publish_on_payment)
 values(p_event_id,p_capacity,target-current_price,p_livemode,e.status='draft') returning * into purchase;
 return purchase;
end $$;
create or replace function public.fulfil_event_purchase(p_id uuid,p_session text,p_intent text,p_amount integer,p_currency text,p_live boolean,p_receipt text)
returns void language plpgsql security definer set search_path=public as $$
declare purchase public.event_purchases; e public.events;
begin
 perform 1 from public.events where id=(select event_id from public.event_purchases where id=p_id) for update;
 select * into purchase from public.event_purchases where id=p_id for update;
 if not found or purchase.stripe_session_id is distinct from p_session or purchase.amount_cents<>p_amount
 or purchase.currency<>p_currency or purchase.livemode<>p_live then raise exception 'Payment does not match purchase'; end if;
 if purchase.status='paid' then return; end if;
 select * into e from public.events where id=purchase.event_id;
 if purchase.publish_on_payment and e.status='draft' and not public.event_route_ready(e.id) then raise exception 'Event route is not ready for publication'; end if;
 update public.event_purchases set status='paid',stripe_payment_intent=p_intent,receipt_url=p_receipt,paid_at=now() where id=p_id;
 update public.events set player_capacity=greatest(player_capacity,purchase.target_capacity),
 status=case when purchase.publish_on_payment and status='draft' then 'active' else status end where id=purchase.event_id;
end $$;

-- Serialise route edits with checkout reservation using the same event lock.
create function public.guard_pay_publish_route() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is not null and not public.is_event_admin() then
   perform 1 from public.events where id in (new.event_id,old.event_id) order by id for update;
   if exists(select 1 from public.event_purchases where event_id in (new.event_id,old.event_id) and status='pending' and publish_on_payment) then
     raise exception 'Cancel the outstanding Pay & publish checkout before changing waypoints';
   end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger guard_pay_publish_route before insert or update or delete on public.waypoints for each row execute function public.guard_pay_publish_route();
create function public.guard_pay_publish_event() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is not null and not public.is_event_admin() and exists(select 1 from public.event_purchases where event_id=old.id and status='pending' and publish_on_payment)
 and (new.name is distinct from old.name or new.status is distinct from old.status or new.requested_capacity is distinct from old.requested_capacity
 or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at) then
   raise exception 'Cancel the outstanding Pay & publish checkout before changing publication settings';
 end if;
 return new;
end $$;
create trigger guard_pay_publish_event before update on public.events for each row execute function public.guard_pay_publish_event();
