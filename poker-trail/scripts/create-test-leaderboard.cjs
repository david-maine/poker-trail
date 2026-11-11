// Explicit live fixture creation. Credentials are read into memory only.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const checked = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
async function main() {
  const { environmentFor } = require('./start-environment.cjs');
  if (process.argv.includes('--development') === process.argv.includes('--production')) throw new Error('Choose exactly one of --development or --production.');
  Object.assign(process.env, environmentFor(process.argv.includes('--development') ? 'development' : 'production'));
  const ref = fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (new URL(url).hostname.split('.')[0] !== ref) throw new Error('Linked project mismatch');
  const keys = JSON.parse(execFileSync(path.resolve('node_modules/supabase/bin', process.platform === 'win32' ? 'supabase.exe' : 'supabase'), ['projects', 'api-keys', '--project-ref', ref, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  const admin = createClient(url, keys.find(k => k.name === 'service_role').api_key, { auth: { persistSession: false, autoRefreshToken: false } });
  const events = checked(await admin.from('events').select('*').order('created_at', { ascending: false }));
  if (!process.argv.includes('--create')) { console.log(JSON.stringify(events.map(({ id, name, slug }) => ({ id, name, slug })), null, 2)); return; }
  const source = events.find(e => /busselton.*caravan|caravan.*busselton/i.test(e.name));
  if (!source) throw new Error('Busselton caravan park source event not found');
  const sourcePoints = checked(await admin.from('waypoints').select('*').eq('event_id', source.id).order('sort_order'));
  if (sourcePoints.length < 5) throw new Error('Expected at least five source waypoints');
  let event;
  try {
    event = checked(await admin.from('events').insert({ name: 'Busselton Caravan Park — 100 Player Test', slug: 'busselton-caravan-park-100-test-' + Date.now(), description: 'Synthetic 100-player leaderboard test. Waypoints copied from ' + source.name + '.', status: 'active', created_by: source.created_by, starts_at: new Date(Date.now() - 3600000).toISOString(), ends_at: new Date(Date.now() + 30 * 86400000).toISOString() }).select('*').single());
    const points = checked(await admin.from('waypoints').insert(sourcePoints.map(({ code, name, latitude, longitude, radius_meters, sort_order, proof_type, proof_value }) => ({ event_id: event.id, code, name, latitude, longitude, radius_meters, sort_order, proof_type, proof_value, is_active: true }))).select('*').order('sort_order'));
    const hands = [
      ['Royal Flush', 10, ['AS','KS','QS','JS','10S'], [14]],
      ['Straight Flush', 9, ['9H','8H','7H','6H','5H'], [9]],
      ['Four of a Kind', 8, ['AC','AD','AH','AS','KD'], [14,13]],
      ['Full House', 7, ['KC','KD','KH','QS','QD'], [13,12]],
      ['Flush', 6, ['AC','JC','9C','6C','2C'], [14,11,9,6,2]],
      ['Straight', 5, ['10S','9H','8D','7C','6S'], [10]],
      ['Three of a Kind', 4, ['8S','8H','8D','AC','KS'], [8,14,13]],
      ['Two Pair', 3, ['JS','JH','4D','4C','AS'], [11,4,14]],
      ['Pair', 2, ['QS','QH','9D','6C','3S'], [12,9,6,3]],
      ['High Card', 1, ['AS','JH','9D','6C','3S'], [14,11,9,6,3]],
    ];
    // Synthetic UUIDs are fixture identities, not authentication accounts.
    const runs = checked(await admin.from('runs').insert(Array.from({ length: 100 }, (_, i) => {
      const [name, rank, cards, tiebreaker] = hands[i % hands.length];
      const finished = new Date(Date.now() - (100 - i) * 60000).toISOString();
      return { event_id: event.id, user_id: randomUUID(), display_name: 'Test Player ' + String(i + 1).padStart(3, '0'), status: 'completed', started_at: new Date(Date.now() - 4 * 3600000).toISOString(), finished_at: finished, last_claim_at: finished, visit_count: points.length, best_hand_name: name, best_hand_rank: rank, best_hand_cards: cards, tiebreaker };
    })).select('id'));
    const publicClient = createClient(url, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const board = checked(await publicClient.from('leaderboard_entries').select('*').eq('event_id', event.id).order('leaderboard_rank'));
    if (board.length !== 100 || runs.length !== 100 || board[99].leaderboard_rank !== 100) throw new Error('Leaderboard verification failed');
    for (let i = 0; i < points.length; i++) if (points[i].latitude !== sourcePoints[i].latitude || points[i].longitude !== sourcePoints[i].longitude) throw new Error('Coordinate verification failed');
    console.log(JSON.stringify({ eventId: event.id, name: event.name, eventCode: event.event_code, entries: board.length, waypoints: points.length, source: source.name, verified: true }, null, 2));
  } catch (error) {
    if (event) checked(await admin.from('events').delete().eq('id', event.id));
    throw error;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
