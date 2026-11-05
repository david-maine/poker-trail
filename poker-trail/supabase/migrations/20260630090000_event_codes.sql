alter table public.events
add column if not exists event_code text;

create or replace function public.generate_event_code()
returns text
language plpgsql
volatile
as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  char_index integer;
begin
  for char_index in 1..6 loop
    code := code || substr(chars, 1 + floor(random() * length(chars))::integer, 1);
  end loop;

  return code;
end;
$$;

create or replace function public.set_event_code()
returns trigger
language plpgsql
as $$
declare
  next_code text;
begin
  if new.event_code is null or btrim(new.event_code) = '' then
    loop
      next_code := public.generate_event_code();
      exit when not exists (
        select 1
        from public.events
        where events.event_code = next_code
          and events.id is distinct from new.id
      );
    end loop;

    new.event_code := next_code;
  else
    new.event_code := upper(regexp_replace(new.event_code, '\s+', '', 'g'));
  end if;

  return new;
end;
$$;

do $$
declare
  event_record record;
  next_code text;
begin
  for event_record in
    select id
    from public.events
    where event_code is null or btrim(event_code) = ''
  loop
    loop
      next_code := public.generate_event_code();
      exit when not exists (
        select 1
        from public.events
        where event_code = next_code
      );
    end loop;

    update public.events
    set event_code = next_code
    where id = event_record.id;
  end loop;
end;
$$;

drop trigger if exists set_events_event_code on public.events;
create trigger set_events_event_code
before insert or update of event_code on public.events
for each row
execute function public.set_event_code();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_event_code_format'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
    add constraint events_event_code_format
    check (event_code ~ '^[A-Z0-9]{6}$');
  end if;
end;
$$;

create unique index if not exists events_event_code_key
on public.events (event_code);

alter table public.events
alter column event_code set not null;
