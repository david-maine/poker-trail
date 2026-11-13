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
  const db = createClient(env.EXPO_PUBLIC_SUPABASE_URL, keys.find(key => key.name === 'service_role').api_key, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = checked(await db.from('organizer_profiles').select('user_id').eq('display_name', 'davidmaine1997').single());
  const existing = checked(await db.from('events').select('*').eq('slug', 'test-expired-event').maybeSingle());
  if (existing) {
    if (existing.created_by !== owner.user_id || !existing.expires_at || Date.parse(existing.expires_at) >= Date.now()) throw new Error('Existing fixture does not match the expected expired event');
    console.log(JSON.stringify({ name: existing.name, expiresAt: existing.expires_at, alreadyExists: true }));
    return;
  }
  if (!process.argv.includes('--apply')) { console.log('Will add one expired free-tier event with five waypoints and five test players.'); return; }
  let event;
  try {
    event = checked(await db.from('events').insert({ name: 'Expired - free tier players registered', slug: 'test-expired-event', created_by: owner.user_id, status: 'draft', player_capacity: 25, requested_capacity: 25, description: 'Synthetic development fixture for expired-event screens.' }).select('*').single());
    checked(await db.from('waypoints').insert(Array.from({ length: 5 }, (_, i) => ({ event_id: event.id, code: 'wp' + (i + 1), name: 'Waypoint ' + (i + 1), sort_order: i, latitude: -27.47 + i * 0.001, longitude: 153.025 + i * 0.001, radius_meters: 30, proof_type: 'gps', is_active: true }))));
    checked(await db.from('events').update({ status: 'active' }).eq('id', event.id));
    checked(await db.from('runs').insert(Array.from({ length: 5 }, (_, i) => ({ event_id: event.id, user_id: randomUUID(), display_name: 'Test Player ' + (i + 1), status: 'active', visit_count: 0 }))));
    // Backdate after fixture creation so ordinary registration/window guards remain intact.
    const now = Date.now(), day = 86400000;
    checked(await db.from('events').update({ first_published_at: new Date(now - 31 * day).toISOString(), expires_at: new Date(now - day).toISOString() }).eq('id', event.id));
    const saved = checked(await db.from('events').select('id,name,status,player_capacity,first_published_at,expires_at').eq('id', event.id).single());
    const points = checked(await db.from('waypoints').select('id').eq('event_id', event.id));
    const players = checked(await db.from('runs').select('id').eq('event_id', event.id));
    if (Date.parse(saved.expires_at) >= Date.now() || points.length !== 5 || players.length !== 5) throw new Error('Expired fixture verification failed');
    console.log(JSON.stringify({ environment: 'development', event: saved, waypoints: points.length, players: players.length, verified: true }, null, 2));
  } catch (error) {
    if (event) checked(await db.from('events').delete().eq('id', event.id));
    throw error;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
