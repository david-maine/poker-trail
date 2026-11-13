alter table public.events add column registrations_paused boolean not null default false;

-- Pause only new registrations. Existing players can rejoin and submit hands.
create function public.guard_paused_registration() returns trigger
language plpgsql security definer set search_path = public as $$
declare paused boolean;
begin
  if tg_op = 'UPDATE' then
    if nullif(btrim(old.display_name), '') is not null then return new; end if;
  elsif exists (
    select 1 from public.runs where event_id=new.event_id and user_id=new.user_id
      and nullif(btrim(display_name), '') is not null
  ) then return new;
  end if;
  -- Serialize with the organiser's pause/resume update.
  select registrations_paused into paused from public.events where id=new.event_id for update;
  if paused then raise exception 'Registrations are paused for this event. Please try again later.'; end if;
  return new;
end;
$$;
create trigger guard_paused_registration before insert or update on public.runs
for each row execute function public.guard_paused_registration();
