// Explicitly replaces development event data with the five organiser test scenarios.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { environmentFor } = require('./start-environment.cjs');
const checked = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

async function main() {
  const env = environmentFor('development');
  const ref = fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim();
  if (ref !== 'cjqxoubluqpupfsofjch' || new URL(env.EXPO_PUBLIC_SUPABASE_URL).hostname !== ref + '.supabase.co') throw new Error('Development project mismatch');
  const keys = JSON.parse(execFileSync(path.resolve('node_modules/supabase/bin/supabase.exe'), ['projects', 'api-keys', '--project-ref', ref, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  const db = createClient(env.EXPO_PUBLIC_SUPABASE_URL, keys.find(k => k.name === 'service_role').api_key, { auth: { persistSession: false, autoRefreshToken: false } });
  const oldEvents = checked(await db.from('events').select('id,name,created_by'));
  const profiles = checked(await db.from('organizer_profiles').select('user_id,display_name'));
  const owner = profiles.find(p => p.display_name === 'davidmaine1997');
  if (!owner) throw new Error('Expected organiser not found');
  const purchases = checked(await db.from('event_purchases').select('id,event_id,livemode'));
  if (purchases.some(p => p.livemode)) throw new Error('Live payment record found; refusing development reset');
  const tiers = checked(await db.from('event_capacity_tiers').select('*').order('capacity'));
  const free = tiers.find(t => t.amount_cents === 0), paid = tiers.find(t => t.amount_cents > 0);
  if (!free || !paid) throw new Error('Missing capacity tiers');
  const source = checked(await db.from('waypoints').select('latitude,longitude,radius_meters,sort_order').eq('event_id', oldEvents.find(e => e.name === 'Peaceful Bay')?.id ?? oldEvents[0]?.id).order('sort_order'));
  const points = Array.from({ length: 5 }, (_, i) => ({ code: 'wp' + (i + 1), name: 'Waypoint ' + (i + 1), sort_order: i, latitude: source.find(p => p.sort_order === i)?.latitude ?? -27.47 + i * 0.001, longitude: source.find(p => p.sort_order === i)?.longitude ?? 153.025 + i * 0.001, radius_meters: source.find(p => p.sort_order === i)?.radius_meters ?? 30, proof_type: 'gps', is_active: true }));
  const scenarios = [
    { name: 'Draft - no waypoints set', status: 'draft', points: 0, capacity: free.capacity, players: 0 },
    { name: 'Draft - waypoints set', status: 'draft', points: 5, capacity: free.capacity, players: 0 },
    { name: 'Active - free tier no players registered', status: 'active', points: 5, capacity: free.capacity, players: 0 },
    { name: 'Active - free tier players registered', status: 'active', points: 5, capacity: free.capacity, players: 5 },
    { name: 'Active - first paid tier players registered', status: 'active', points: 5, capacity: paid.capacity, players: 5 },
  ];
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ environment: 'development', deleteEvents: oldEvents.length, deleteTestPurchases: purchases.length, scenarios }, null, 2)); return; }
  // Build and verify replacements before deleting any existing data.
  const created = [];
  try {
    for (const scenario of scenarios) {
      let event = checked(await db.from('events').insert({ name: scenario.name, slug: 'test-' + randomUUID(), status: 'draft', created_by: owner.user_id, player_capacity: scenario.capacity, requested_capacity: scenario.capacity, description: 'Synthetic development fixture.' }).select('*').single());
      created.push(event);
      if (scenario.points) checked(await db.from('waypoints').insert(points.map(p => ({ ...p, event_id: event.id }))));
      if (scenario.status === 'active') event = checked(await db.from('events').update({ status: 'active' }).eq('id', event.id).select('*').single());
      if (scenario.players) checked(await db.from('runs').insert(Array.from({ length: scenario.players }, (_, i) => ({ event_id: event.id, user_id: randomUUID(), display_name: 'Test Player ' + (i + 1), status: 'active', visit_count: 0 }))));
      const waypoints = checked(await db.from('waypoints').select('id').eq('event_id', event.id));
      const runs = checked(await db.from('runs').select('id').eq('event_id', event.id));
      if (waypoints.length !== scenario.points || runs.length !== scenario.players || event.status !== scenario.status || event.player_capacity !== scenario.capacity) throw new Error('Fixture verification failed: ' + scenario.name);
    }
  } catch (error) {
    if (created.length) checked(await db.from('events').delete().in('id', created.map(e => e.id)));
    throw error;
  }
  if (purchases.length) checked(await db.from('event_purchases').delete().in('id', purchases.map(p => p.id)));
  if (oldEvents.length) checked(await db.from('events').delete().in('id', oldEvents.map(e => e.id)));
  const final = checked(await db.from('events').select('id,name,status,player_capacity'));
  if (final.length !== 5 || !final.every(e => created.some(c => c.id === e.id))) throw new Error('Final event set differs from expected fixtures');
  console.log(JSON.stringify({ environment: 'development', deletedEvents: oldEvents.length, deletedTestPurchases: purchases.length, events: final, registeredPlayersPerPopulatedEvent: 5, verified: true }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
