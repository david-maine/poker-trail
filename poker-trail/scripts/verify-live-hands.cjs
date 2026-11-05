// Explicit live smoke test. Creates a disposable event and two accounts, then removes them.
// Project credentials stay in memory and are never printed or saved.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');

async function main() {
  for (const file of ['.env', '.env.local']) {
    if (fs.existsSync(file)) Object.assign(process.env, require('node:util').parseEnv(fs.readFileSync(file, 'utf8')));
  }
  const ref = fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  assert.equal(new URL(url).hostname.split('.')[0], ref, 'Linked and app projects must match');
  const binary = process.platform === 'win32' ? 'supabase.exe' : 'supabase';
  let keys;
  try {
    keys = JSON.parse(execFileSync(path.resolve('node_modules/supabase/bin', binary),
      ['projects', 'api-keys', '--project-ref', ref, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch { throw new Error('Unable to retrieve project credentials through the authenticated Supabase CLI'); }
  const service = keys.find(key => key.name === 'service_role')?.api_key;
  assert.ok(service, 'A service credential is required for disposable test setup and cleanup');
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, service, options);
  const players = [0, 1].map(() => createClient(url, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, options));
  const users = [];
  let eventId, channel;
  let notifications = 0;
  const checked = result => {
    if (result.error) throw new Error(result.error.message);
    return result.data;
  };
  const waitFor = async (predicate, description) => {
    const deadline = Date.now() + 15000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(predicate(), description);
  };
  // Recover only disposable fixtures left by a previously interrupted verification.
  const leftovers = checked(await admin.from('events').select('id').eq('name', 'Temporary Live Sync Verification').like('slug', 'live-sync-verification-%'));
  for (const leftover of leftovers) checked(await admin.from('events').delete().eq('id', leftover.id));
  if (process.argv.includes('--cleanup-only')) {
    console.log(`Removed ${leftovers.length} leftover verification event(s).`);
    return;
  }
  try {
    for (const player of players) users.push(checked(await player.auth.signInAnonymously()).user.id);
    const event = checked(await admin.from('events').insert({
      slug: 'live-sync-verification-' + Date.now(), name: 'Temporary Live Sync Verification', status: 'active',
      starts_at: new Date(Date.now() - 3600000).toISOString(), ends_at: new Date(Date.now() + 3600000).toISOString(),
    }).select('id').single());
    eventId = event.id;
    const points = checked(await admin.from('waypoints').insert(Array.from({ length: 5 }, (_, i) => ({
      event_id: eventId, code: 'verify-' + i, name: 'Verification ' + i, latitude: 0, longitude: 0, radius_meters: 100, sort_order: i,
    }))).select('id,sort_order').order('sort_order'));
    const board = async () => checked(await players[1].from('leaderboard_entries').select('*').eq('event_id', eventId).order('leaderboard_rank'));
    let subscribed = false;
    channel = players[1].channel('verification-' + eventId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_leaderboard_updates', filter: 'event_id=eq.' + eventId }, () => { notifications++; })
      .subscribe(status => { subscribed = status === 'SUBSCRIBED'; });
    await waitFor(() => subscribed, 'Live leaderboard subscription connects');
    for (let i = 0; i < 2; i++) checked(await players[i].from('runs').upsert({ event_id: eventId, user_id: users[i], display_name: 'Verification Crew ' + i }, { onConflict: 'event_id,user_id' }).select('id').single());
    let rows = await board();
    assert.equal(rows.length, 2); assert.ok(rows.every(row => row.visit_count === 0));
    await waitFor(() => notifications >= 1, 'Registration produces a live notification');
    console.log('PASS: two registered players visible before collecting cards; live registration notification received');

    const cards = ['AS', 'KH', '9D', '7C', '3S'];
    const claims = points.map((point, i) => ({ waypointId: point.id, card: cards[i], claimedAt: new Date(Date.now() - 1000 + i).toISOString(), claimedLat: i === 0 ? 0.0005 : 0, claimedLng: 0, gpsAccuracyMeters: 5 }));
    const sync = async (player, snapshot) => {
      const result = await player.functions.invoke('submit-hand', { body: { eventId, claims: snapshot }, timeout: 30000 });
      if (result.error) {
        let reason = result.error.message;
        if (result.error.context instanceof Response) reason += ': ' + await result.error.context.text();
        throw new Error(reason);
      }
      return result.data;
    };
    const before = notifications;
    const partial = await sync(players[0], claims.slice(0, 1));
    assert.equal(partial.run.status, 'active'); assert.equal(partial.claims.length, 1);
    await waitFor(() => notifications > before, 'Card collection produces a live notification');
    rows = await board();
    assert.equal(rows.find(row => row.user_id === users[0]).visit_count, 1);
    assert.equal(checked(await players[1].from('run_card_claims').select('*')).length, 0);
    console.log('PASS: first card updates the shared leaderboard immediately; other players cannot read private claims');

    checked(await admin.from('waypoints').update({ radius_meters: 5 }).eq('id', points[0].id));

    await Promise.all([sync(players[0], claims.slice(0, 1)), sync(players[0], claims.slice(0, 2))]);
    const stale = await sync(players[0], claims.slice(0, 1));
    assert.equal(stale.run.visitCount, 2);
    await assert.rejects(sync(players[0], [{ ...claims[0], card: '2H' }]), /cannot be changed/);
    const complete = await sync(players[0], claims);
    assert.equal(complete.run.status, 'completed');
    const retry = await sync(players[0], claims);
    assert.equal(retry.run.finishedAt, complete.run.finishedAt);
    const pair = claims.slice(0, 2).map((claim, i) => ({ ...claim, card: i === 0 ? 'AH' : 'AD' }));
    await assert.rejects(sync(players[1], pair), /outside the current 5 m radius/);
    pair[0] = { ...pair[0], claimedLat: 0, claimedAt: new Date().toISOString() };
    await sync(players[1], pair);
    rows = await board();
    assert.equal(rows[0].user_id, users[0]); assert.equal(rows[1].best_hand_name, 'Pair');
    console.log('PASS: concurrent retries cannot reduce progress; accepted cards are immutable; completion is automatic and ranks before a stronger partial hand');
    console.log('PASS: shrinking a radius preserves accepted cards; rejected unsynced cards recover with a fresh in-radius proof');
  } finally {
    if (channel) await players[1].removeChannel(channel);
    let cleanupFailed = false;
    if (eventId) {
      const result = await admin.from('events').delete().eq('id', eventId);
      if (result.error) { cleanupFailed = true; console.error('Test event cleanup failed:', result.error.message); }
    }
    for (const user of users) {
      const result = await admin.auth.admin.deleteUser(user);
      if (result.error) { cleanupFailed = true; console.error('Test account cleanup failed:', result.error.message); }
    }
    for (const player of players) await player.removeAllChannels();
    if (cleanupFailed) throw new Error('Temporary test data needs cleanup');
    console.log('Temporary test event and player accounts removed.');
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
