-- Keep the existing admin policy; organisers may delete only their own events.
create policy "organisers can delete their own events"
on public.events for delete to authenticated
using (created_by = auth.uid());
