const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { edgeInternals } = require('./support.cjs');

test('live-hand migration and transactional claims in PostgreSQL', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create publication supabase_realtime;
  `);
  const migrations = path.resolve(__dirname, '../supabase/migrations');
  for (const name of fs.readdirSync(migrations).sort()) {
    // PGlite has built-in gen_random_uuid; this project uses no other pgcrypto functions.
    const sql = fs.readFileSync(path.join(migrations, name), 'utf8').replace('create extension if not exists pgcrypto;', '');
    await db.exec(sql);
  }
  const owner = randomUUID(), other = randomUUID(), event = randomUUID();
  const waypoints = Array.from({ length: 5 }, () => randomUUID());
  await db.query('insert into auth.users(id) values ($1),($2)', [owner, other]);
  await db.query("insert into events(id,slug,name,status,created_by) values ($1,'sync-test','Sync Test','active',$2)", [event, other]);
  for (let i = 0; i < 5; i++) await db.query(`insert into waypoints(id,event_id,code,name,latitude,longitude,radius_meters,sort_order)
    values ($1,$2,$3,$3,0,0,100,$4)`, [waypoints[i], event, 'point-' + i, i]);
  const asPlayer = async user => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    await db.exec('set role authenticated');
  };
  await asPlayer(owner);
  await db.query('insert into runs(event_id,user_id,display_name) values ($1,$2,$3)', [event, owner, 'New Crew']);
  // Match the app's registration upsert and its column-level privileges.
  await db.query(`insert into runs(event_id,user_id,display_name) values ($1,$2,$3)
    on conflict(event_id,user_id) do update set event_id=excluded.event_id,user_id=excluded.user_id,display_name=excluded.display_name`, [event, owner, 'New Crew']);
  await db.exec('reset role');
  const actualRun = (await db.query('select id from runs where event_id=$1 and user_id=$2', [event, owner])).rows[0].id;
  const readBoard = () => db.query('select * from leaderboard_entries where event_id=$1 order by leaderboard_rank', [event]);
  const { evaluateBestHand } = edgeInternals();
  const cards = ['AS', 'KH', '9D', '7C', '3S'];
  const claims = waypoints.map((id, i) => ({ waypointId: id, card: cards[i], claimedAt: `2026-11-04T01:00:0${i}.000Z`, claimedLat: 0, claimedLng: 0, gpsAccuracyMeters: 5 }));
  const apply = async snapshot => (await db.query('select apply_hand_snapshot($1,$2::jsonb,$3::jsonb) as value', [actualRun, JSON.stringify(snapshot), JSON.stringify(evaluateBestHand(snapshot.map(c => c.card)))])).rows[0].value.run;

  await t.test('registration immediately publishes a zero-card entry', async () => {
    const row = (await readBoard()).rows[0];
    assert.equal(row.player_label, 'New Crew'); assert.equal(row.visit_count, 0);
    assert.equal(row.total_waypoints, 5); assert.deepEqual(row.best_hand_cards, []);
    assert.equal((await db.query('select revision from event_leaderboard_updates where event_id=$1', [event])).rows[0].revision, 2);
  });
  await t.test('partial hands sync without completing the run', async () => {
    const result = await apply(claims.slice(0, 2));
    assert.equal(result.status, 'active'); assert.equal(result.visit_count, 2); assert.equal(result.finished_at, null);
    assert.deepEqual((await readBoard()).rows[0].best_hand_cards, ['AS', 'KH']);
  });
  await t.test('retries and stale snapshots are idempotent and cannot remove cards', async () => {
    await apply(claims.slice(0, 2));
    const result = await apply(claims.slice(0, 1));
    assert.equal(result.visit_count, 2);
    assert.equal((await db.query('select count(*)::int as n from run_card_claims')).rows[0].n, 2);
  });
  await t.test('modified claims and divergent snapshots are rejected without writes', async () => {
    await assert.rejects(apply([{ ...claims[0], card: '2H' }]), /cannot be changed/);
    await assert.rejects(apply([claims[0], claims[2]]), /another device/);
    assert.equal((await readBoard()).rows[0].visit_count, 2);
  });
  await t.test('completion is automatic and its timestamp survives retries', async () => {
    const completed = await apply(claims);
    assert.equal(completed.status, 'completed'); assert.equal(completed.visit_count, 5);
    assert.ok(completed.finished_at);
    const retry = await apply(claims.slice(0, 1));
    assert.equal(retry.finished_at, completed.finished_at);
  });
  await t.test('completed hands first, partial strength next, no cards last; legacy entries survive', async () => {
    const insert = async (label, count, status, score, uid = randomUUID()) => db.query(`insert into runs(event_id,user_id,display_name,status,visit_count,best_hand_rank,best_hand_name,tiebreaker,finished_at)
      values ($1,$2,$3,$4,$5,$6,'Fixture',$7,$8)`, [event, uid, label, status, count, score, count ? [14] : [], status === 'completed' ? '2026-11-04T02:00:00Z' : null]);
    await insert('Partial Pair', 2, 'active', 2);
    await insert('Waiting', 0, 'active', 0);
    await insert('Abandoned', 3, 'abandoned', 4);
    await insert(null, 5, 'completed', 1);
    const rows = (await readBoard()).rows;
    assert.deepEqual(rows.map(r => r.run_status), ['completed', 'completed', 'active', 'active']);
    assert.equal(rows[2].player_label, 'Partial Pair'); assert.equal(rows[3].player_label, 'Waiting');
    assert.ok(rows.some(r => r.player_label.startsWith('Player ')));
    // A different event does not leak into this event's ranks.
    assert.deepEqual(rows.map(r => Number(r.leaderboard_rank)), [1, 2, 3, 4]);
  });
  await t.test('private claims and score writes are protected; public leaderboard remains readable', async () => {
    await asPlayer(owner);
    assert.equal((await db.query('select count(*)::int as n from run_card_claims')).rows[0].n, 5);
    await assert.rejects(db.query("update runs set best_hand_rank=10 where id=$1", [actualRun]), /permission denied/);
    await assert.rejects(db.query('select apply_hand_snapshot($1,$2::jsonb,$3::jsonb)', [actualRun, JSON.stringify(claims), '{}']), /permission denied/);
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [randomUUID()]);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select count(*)::int as n from run_card_claims')).rows[0].n, 0);
    await db.exec('reset role; set role anon');
    assert.equal((await readBoard()).rows.length, 4);
    await assert.rejects(db.query('select * from run_card_claims'), /permission denied/);
    await db.exec('reset role');
  });
  await t.test('deleting an event removes its runs, claims, and notification revision', async () => {
    await db.query('delete from events where id=$1', [event]);
    assert.equal((await readBoard()).rows.length, 0);
    assert.equal((await db.query('select count(*)::int as n from run_card_claims')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int as n from event_leaderboard_updates')).rows[0].n, 0);
  });
});
