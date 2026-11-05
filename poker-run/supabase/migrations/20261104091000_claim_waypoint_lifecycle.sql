-- Event deletion cascades through both runs and waypoints. Check the waypoint
-- reference at transaction end, after the run's claims have also been removed.
alter table public.run_card_claims drop constraint run_card_claims_waypoint_id_fkey;
alter table public.run_card_claims add constraint run_card_claims_waypoint_id_fkey
  foreign key (waypoint_id) references public.waypoints(id) deferrable initially deferred;
