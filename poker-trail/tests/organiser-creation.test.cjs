const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {loader}=require('./support.cjs');
const drafts=loader()('src/lib/organiserWaypointDraft.ts');
const points=()=>Array.from({length:5},(_,slotIndex)=>({slotIndex,latitude:slotIndex,longitude:0,radiusMeters:20}));

test('waypoint drafts require explicit valid coordinates and a positive integer radius',()=>{
 assert.equal(drafts.parseWaypointDraft(drafts.emptyWaypointDraft(),0),null);
 assert.deepEqual(drafts.parseWaypointDraft({latitude:'0',longitude:'0',radius:'20'},0),points()[0]);
 for(const patch of [{latitude:''},{longitude:' '},{latitude:'91'},{longitude:'181'},{latitude:'Infinity'},{radius:'0'},{radius:'1.5'},{radius:'2147483648'}]) {
  assert.equal(drafts.parseWaypointDraft({latitude:'0',longitude:'0',radius:'20',...patch},0),null);
 }
 assert.doesNotThrow(()=>drafts.validateWaypointSet(points()));
 assert.throws(()=>drafts.validateWaypointSet(points().slice(0,4)),/five/);
 assert.throws(()=>drafts.validateWaypointSet(points().map(p=>({...p,slotIndex:0}))),/five/);
});

test('creation service validates before sending one organiser RPC and propagates failures',async()=>{
 let calls=0,session={user:{id:'owner'}},failure=null;
 const query={select(){return this;},eq(){return this;},async maybeSingle(){return {data:{user_id:'owner',display_name:'Owner'}};}};
 const service=loader({'./organiserSupabase':{organiserSupabase:{auth:{getSession:async()=>({data:{session}})},from:()=>query,rpc:async(name,args)=>{
  calls++;assert.equal(name,'create_organiser_event_with_waypoints');assert.equal(args.p_name,'Trail');
  assert.equal(args.p_waypoints.length,5);assert.equal(args.p_waypoints[0].slot_index,0);
  return {data:{id:'event',name:'Trail',status:'active',player_capacity:25},error:failure};
 }}}})('src/lib/organiser.ts');
 await assert.rejects(service.createOrganiserEventWithWaypoints({name:'Trail',waypoints:[]}),/five/);
 await assert.rejects(service.createOrganiserEventWithWaypoints({name:' ',waypoints:points()}),/required/);
 assert.equal(calls,0);
 const event=await service.createOrganiserEventWithWaypoints({name:' Trail ',waypoints:points()});
 assert.equal(event.status,'active');assert.equal(event.playerCapacity,25);assert.equal(calls,1);
 failure={message:'Publication failed'};
 await assert.rejects(service.createOrganiserEventWithWaypoints({name:'Trail',waypoints:points()}),e=>e===failure);
 session=null;
 await assert.rejects(service.createOrganiserEventWithWaypoints({name:'Trail',waypoints:points()}),/Sign in/);
 assert.equal(calls,2);
});

test('transactional creation saves a draft with five waypoints and rolls back failures',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,public to anon,authenticated,service_role;
 grant execute on function auth.uid() to anon,authenticated,service_role;
 create publication supabase_realtime;`);
 const dir=path.resolve(__dirname,'../supabase/migrations');
 for(const file of fs.readdirSync(dir).sort()) await db.exec(fs.readFileSync(path.join(dir,file),'utf8').replace('create extension if not exists pgcrypto;',''));
 const owner=randomUUID(),outsider=randomUUID();
 await db.query('insert into auth.users(id) values ($1),($2)',[owner,outsider]);
 await db.query("insert into organizer_profiles(user_id,display_name) values ($1,'Owner')",[owner]);
 await db.exec(`create function public.fail_creation_fixture() returns trigger language plpgsql as $$ begin
 if new.name='Fail publish' and new.status='active' then raise exception 'Publication fixture failure'; end if; return new; end $$;
 create trigger fail_creation_fixture before update on events for each row execute function fail_creation_fixture();
 create function public.fail_waypoint_fixture() returns trigger language plpgsql as $$ begin
 if new.radius_meters=999 then raise exception 'Waypoint fixture failure'; end if; return new; end $$;
 create trigger fail_waypoint_fixture before insert on waypoints for each row execute function fail_waypoint_fixture();`);
 const asUser=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 const payload=points().map(p=>({slot_index:p.slotIndex,latitude:p.latitude,longitude:p.longitude,radius_meters:p.radiusMeters}));
 const create=(name,items=payload)=>db.query('select * from public.create_organiser_event_with_waypoints($1,$2::jsonb)',[name,JSON.stringify(items)]);
 await asUser(owner);
 const event=(await create('Created together')).rows[0];
 assert.equal(event.status,'draft');assert.equal(event.created_by,owner);assert.equal(event.player_capacity,25);assert.ok(event.event_code);
 const saved=(await db.query('select * from waypoints where event_id=$1 order by sort_order',[event.id])).rows;
 assert.equal(saved.length,5);assert.equal(saved[0].latitude,0);assert.equal(saved[0].longitude,0);assert.equal(saved[4].code,'wp5');
 for(const invalid of [payload.slice(0,4),payload.map(p=>({...p,slot_index:0})),payload.map(p=>({...p,latitude:null})),payload.map(p=>({...p,radius_meters:0})),payload.map(p=>({...p,longitude:181}))]) {
  await assert.rejects(create('Invalid',invalid));
 }
 await assert.rejects(create(' '),/required/);

 await assert.rejects(create('Fail waypoint',payload.map((p,i)=>i===4?{...p,radius_meters:999}:p)),/Waypoint fixture failure/);
 assert.equal((await db.query("select count(*)::int as n from events where name in ('Invalid','Fail publish','Fail waypoint')")).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int as n from waypoints where event_id in (select id from events where created_by=$1)',[owner])).rows[0].n,5);
 const draft=(name,items=[],capacity=25)=>db.query('select * from public.create_organiser_event_draft($1,$2::jsonb,$3)',[name,JSON.stringify(items),capacity]);
 const empty=(await draft('Name only')).rows[0];assert.equal(empty.status,'draft');assert.equal(empty.first_published_at,null);assert.equal(empty.requested_capacity,25);
 const partial=(await draft('Partial paid',payload.slice(0,2),100)).rows[0];assert.equal(partial.player_capacity,25);assert.equal(partial.requested_capacity,100);
 assert.equal((await db.query('select count(*)::int as n from waypoints where event_id=$1',[partial.id])).rows[0].n,2);
 await assert.rejects(db.query("update events set status='active' where id=$1",[empty.id]),/five/);
 const paid=(await draft('Ready paid',payload,100)).rows[0];
 await assert.rejects(db.query("update events set status='active' where id=$1",[paid.id]),/payment/);
 const free=(await draft('Ready free',payload)).rows[0];await db.query("update events set status='active' where id=$1",[free.id]);
 assert.ok((await db.query('select first_published_at from events where id=$1',[free.id])).rows[0].first_published_at);
 await assert.rejects(draft('Too many',[...payload,payload[0]]),/five/);await assert.rejects(draft('Bad tier',[],75),/capacity/);
 await assert.rejects(draft('Invalid partial',[{...payload[0],latitude:null}]),/valid numbers/);
 await assert.rejects(draft('Fail partial',[{...payload[0],radius_meters:999}]),/fixture/);
 assert.equal((await db.query("select count(*)::int as n from events where name='Fail partial'")).rows[0].n,0);
 await asUser(outsider);await assert.rejects(create('No profile'),/organiser account/);
 await asUser('');await assert.rejects(create('No session'),/organiser account/);
 await db.exec('reset role;set role anon');await assert.rejects(create('Anonymous'),/permission denied/);
});
