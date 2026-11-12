const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { loader, edgeInternals } = require('./support.cjs');

test('billing client displays money and handles exact expiry boundaries', () => {
 const client = loader({'./organiserSupabase':{}})('src/lib/eventBilling.ts');
 assert.equal(client.money(2900),'A$29.00');
 assert.equal(client.eventExpired({expiresAt:'2026-01-01T00:00:00Z'},Date.parse('2026-01-01T00:00:00Z')),true);
 assert.equal(client.eventExpired({expiresAt:null}),false);
 assert.equal(client.eventExpired({endsAt:'2020-01-01'}),true);
 const edge=edgeInternals();
 assert.match(edge.validateEventTiming({status:'active',expires_at:'2020-01-01'},[]),/expired/);
});

test('PostgreSQL enforces purchases, lifetime, ownership, retry safety and financial retention', async t => {
 const db = new PGlite(); t.after(()=>db.close());
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,public to anon,authenticated,service_role;
 grant execute on function auth.uid() to anon,authenticated,service_role;
 create publication supabase_realtime;`);
 const dir=path.resolve(__dirname,'../supabase/migrations');
 const legacy=randomUUID();
 for(const file of fs.readdirSync(dir).sort()) {
   if(file==='20261112100000_event_billing.sql') await db.query("insert into events(id,name,slug,status) values($1,'Legacy','legacy','active')",[legacy]);
   await db.exec(fs.readFileSync(path.join(dir,file),'utf8').replace('create extension if not exists pgcrypto;',''));
 }
 assert.equal((await db.query('select lifecycle_managed from events where id=$1',[legacy])).rows[0].lifecycle_managed,false);
 await db.exec('grant all on all tables in schema public to service_role');
 const owner=randomUUID(),other=randomUUID();
 await db.query('insert into auth.users(id) values($1),($2)',[owner,other]);
 await db.query("insert into organizer_profiles(user_id,display_name) values($1,'Owner')",[owner]);
 const asUser=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 const asService=async()=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");await db.exec('set role service_role');};
 const points=Array.from({length:5},(_,i)=>({slot_index:i,latitude:i,longitude:0,radius_meters:20}));
 await asUser(owner);
 const e=(await db.query("select * from create_organiser_event_with_waypoints('Paid trail',$1::jsonb)",[JSON.stringify(points)])).rows[0];
 assert.equal(e.status,'draft');assert.equal(e.expires_at,null);assert.equal(e.lifecycle_managed,true);
 await assert.rejects(db.query('update events set player_capacity=250 where id=$1',[e.id]),/capacity/);
 await assert.rejects(db.query('update events set lifecycle_managed=false where id=$1',[e.id]),/lifetime/);
 await assert.rejects(db.query('select reserve_event_purchase($1,$2,50,false)',[e.id,owner]),/permission denied/);
 await assert.rejects(db.query("insert into event_purchases(event_id,target_capacity,amount_cents,livemode) values($1,50,1,false)",[e.id]),/permission denied/);
 const tiers=(await db.query('select * from event_capacity_tiers order by capacity')).rows;
 assert.deepEqual(tiers.map(t=>t.amount_cents),[0,2900,4900,9900]);
 await asService();
 await assert.rejects(db.query('select reserve_event_purchase($1,$2,50,false)',[e.id,other]),/not found/);
 await assert.rejects(db.query('select reserve_event_purchase($1,$2,75,false)',[e.id,owner]),/Unsupported/);
 let purchase=(await db.query('select * from reserve_event_purchase($1,$2,50,false)',[e.id,owner])).rows[0];
 const same=(await db.query('select * from reserve_event_purchase($1,$2,50,false)',[e.id,owner])).rows[0];
 assert.equal(purchase.id,same.id);assert.equal(purchase.amount_cents,2900);assert.equal(purchase.publish_on_payment,true);
 await asUser(owner);
 await assert.rejects(db.query('update waypoints set radius_meters=30 where event_id=$1',[e.id]),/outstanding Pay/);
 await assert.rejects(db.query('update events set requested_capacity=25 where id=$1',[e.id]),/outstanding Pay/);
 await assert.rejects(db.query("update events set name='' where id=$1",[e.id]),/outstanding Pay/);
 await asService();
 await assert.rejects(db.query('select reserve_event_purchase($1,$2,100,false)',[e.id,owner]),/outstanding/);
 await db.query("update event_purchases set stripe_session_id='cs_test' where id=$1",[purchase.id]);
 const fulfil=(amount=2900,live=false,session='cs_test')=>db.query("select fulfil_event_purchase($1,$2,'pi_test',$3,'aud',$4,null)",[purchase.id,session,amount,live]);
 await assert.rejects(fulfil(1),/match/);await assert.rejects(fulfil(2900,true),/match/);await assert.rejects(fulfil(2900,false,'wrong'),/match/);
 await fulfil();await fulfil();
 assert.equal((await db.query('select player_capacity,first_published_at from events where id=$1',[e.id])).rows[0].player_capacity,50);
 const autoPublished=(await db.query('select * from events where id=$1',[e.id])).rows[0];
 assert.equal(autoPublished.status,'active');assert.ok(autoPublished.first_published_at);
 assert.equal(new Date(autoPublished.expires_at)-new Date(autoPublished.first_published_at),30*86400000);
 const upgrade=(await db.query('select * from reserve_event_purchase($1,$2,100,false)',[e.id,owner])).rows[0];assert.equal(upgrade.publish_on_payment,false);
 await asUser(owner);await db.query("update events set status='closed' where id=$1",[e.id]);await asService();
 await fulfil();assert.equal((await db.query('select status from events where id=$1',[e.id])).rows[0].status,'closed');
 await db.query("update event_purchases set stripe_session_id='cs_upgrade' where id=$1",[upgrade.id]);
 await db.query("select fulfil_event_purchase($1,'cs_upgrade','pi_upgrade',2000,'aud',false,null)",[upgrade.id]);
 const upgraded=(await db.query('select * from events where id=$1',[e.id])).rows[0];assert.equal(upgraded.player_capacity,100);assert.equal(upgraded.status,'closed');assert.deepEqual(upgraded.expires_at,autoPublished.expires_at);
 const incomplete=randomUUID();await db.query("insert into events(id,name,slug,created_by,player_capacity) values($1,'Incomplete','incomplete',$2,25)",[incomplete,owner]);
 await assert.rejects(db.query('select reserve_event_purchase($1,$2,50,false)',[incomplete,owner]),/five valid/);
 assert.equal((await db.query('select count(*)::int as n from event_purchases where event_id=$1',[incomplete])).rows[0].n,0);
 await asUser(owner);const cancelled=(await db.query("select * from create_organiser_event_draft('Cancelled checkout',$1::jsonb,50)",[JSON.stringify(points)])).rows[0];await asService();
 const cancelledPurchase=(await db.query('select * from reserve_event_purchase($1,$2,50,false)',[cancelled.id,owner])).rows[0];
 await db.query("update event_purchases set status='cancelled' where id=$1",[cancelledPurchase.id]);
 const stillDraft=(await db.query('select * from events where id=$1',[cancelled.id])).rows[0];assert.equal(stillDraft.status,'draft');assert.equal(stillDraft.first_published_at,null);
 await asUser(owner);await db.query('update waypoints set radius_meters=40 where event_id=$1',[cancelled.id]);await asService();

 // Every paid-to-paid price difference comes from the server catalogue.
 for(const from of tiers.slice(0,-1)) for(const to of tiers.filter(t=>t.capacity>from.capacity)) {
   const id=randomUUID();await db.query("insert into events(id,name,slug,created_by,player_capacity,status) values($1::uuid,'Tier', ($1::uuid)::text,$2,$3,'active')",[id,owner,from.capacity]);
   const p=(await db.query('select * from reserve_event_purchase($1,$2,$3,false)',[id,owner,to.capacity])).rows[0];
   assert.equal(p.amount_cents,to.amount_cents-from.amount_cents);
 }
 await asUser(other);assert.equal((await db.query('select * from event_purchases where event_id=$1',[e.id])).rows.length,0);
 await asUser(owner);
 await assert.rejects(db.query('delete from events where id=$1',[e.id]),/payments/);
 await db.query("update events set status='active' where id=$1",[e.id]);
 const published=(await db.query('select * from events where id=$1',[e.id])).rows[0];
 assert.equal(new Date(published.expires_at)-new Date(published.first_published_at),30*86400000);
 await db.query("update events set status='closed' where id=$1",[e.id]);
 await db.query("update events set status='active' where id=$1",[e.id]);
 assert.deepEqual((await db.query('select expires_at from events where id=$1',[e.id])).rows[0].expires_at,published.expires_at);
 await asService();await db.query("update events set expires_at=now()-interval '1 second' where id=$1",[e.id]);
 await assert.rejects(db.query('select reserve_event_purchase($1,$2,100,false)',[e.id,owner]),/expired/);
 await asUser(owner);
 await assert.rejects(db.query("update events set name='Reuse' where id=$1",[e.id]),/read-only/);
 await assert.rejects(db.query('update waypoints set radius_meters=30 where event_id=$1',[e.id]),/read-only/);
 await assert.rejects(db.query("insert into runs(event_id,user_id,display_name) values($1,$2,'Late player')",[e.id,owner]),/playable/);
 assert.equal((await db.query('select count(*)::int as n from waypoints where event_id=$1',[e.id])).rows[0].n,5);
});
