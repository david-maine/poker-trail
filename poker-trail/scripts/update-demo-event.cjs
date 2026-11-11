// Updates the explicitly named live demo; credentials stay in memory.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createClient } = require('@supabase/supabase-js');
const checked = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const playerNames = ['Liam Mitchell', 'Sarah Bennett', 'Jack Thompson', 'Emily Parker', 'Noah Wilson', 'Chloe Anderson', 'Oliver Hayes', 'Mia Campbell', 'Ethan Brooks', 'Grace Sullivan'];
async function main() {
  const { environmentFor } = require('./start-environment.cjs');
  if (process.argv.includes('--development') === process.argv.includes('--production')) throw new Error('Choose exactly one of --development or --production.');
  Object.assign(process.env, environmentFor(process.argv.includes('--development') ? 'development' : 'production'));
  const ref = fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (new URL(url).hostname.split('.')[0] !== ref) throw new Error('Linked project mismatch');
  const keys = JSON.parse(execFileSync(path.resolve('node_modules/supabase/bin', process.platform === 'win32' ? 'supabase.exe' : 'supabase'), ['projects', 'api-keys', '--project-ref', ref, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  const admin = createClient(url, keys.find(k => k.name === 'service_role').api_key, { auth: { persistSession: false, autoRefreshToken: false } });
  const source = checked(await admin.from('events').select('id,name').eq('slug', 'busselton-caravan-park').single());
  const demo = checked(await admin.from('events').select('id,name').eq('slug', 'poker-trail-demo').single());
  if (process.argv.includes('--remove-massage-player')) {
    const matches = checked(await admin.from('runs').select('id,display_name,status').eq('event_id', demo.id).ilike('display_name', 'excited for the massageee'));
    if (!matches.length) throw new Error('Named player not found in Poker Trail Demo');
    for (const row of matches) checked(await admin.from('runs').update({ status: 'abandoned' }).eq('id', row.id).eq('event_id', demo.id));
    const publicClient = createClient(url, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const board = checked(await publicClient.from('leaderboard_entries').select('player_label').eq('event_id', demo.id));
    if (board.some(row => row.player_label.toLowerCase() === 'excited for the massageee')) throw new Error('Player still visible on leaderboard');
    console.log(JSON.stringify({ event: demo.name, removedEntries: matches.length, verified: true }));
    return;
  }
  if (process.argv.includes('--rename-players')) {
    for (let i = 0; i < playerNames.length; i++) {
      const userId = `de000000-0000-4000-a000-${String(i+1).padStart(12,'0')}`;
      const original = checked(await admin.from('runs').select('*').eq('event_id', demo.id).eq('user_id', userId).single());
      if (original.display_name !== playerNames[i]) {
        if (original.display_name !== `Demo Player ${String(i+1).padStart(2,'0')}`) throw new Error('Unexpected fixture name');
        for (const table of ['run_card_claims']) {
          const claims = checked(await admin.from(table).select('run_id').eq('run_id', original.id));
          if (claims.length) throw new Error('Synthetic entry has real claims; refusing to replace');
        }
        checked(await admin.from('runs').delete().eq('id', original.id).eq('event_id', demo.id));
        const result = await admin.from('runs').insert({ ...original, display_name: playerNames[i] });
        if (result.error) {
          checked(await admin.from('runs').insert(original));
          throw new Error(result.error.message);
        }
      }
      const row = checked(await admin.from('runs').select('display_name').eq('event_id', demo.id).eq('user_id', userId).single());
      if (row.display_name !== playerNames[i]) throw new Error('Player rename verification failed');
    }
    const publicClient = createClient(url, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const board = checked(await publicClient.from('leaderboard_entries').select('*').eq('event_id', demo.id));
    for (const name of playerNames) if (!board.some(row => Object.values(row).includes(name))) throw new Error('Public leaderboard name missing: ' + name);
    console.log(JSON.stringify({ event: demo.name, renamedPlayers: playerNames, verified: true }, null, 2));
    return;
  }
  const points = checked(await admin.from('waypoints').select('*').eq('event_id', source.id).order('sort_order'));
  const existing = checked(await admin.from('waypoints').select('*').eq('event_id', demo.id).order('sort_order'));
  if (points.length < 5 || (existing.length && points.length !== existing.length)) throw new Error('Waypoint counts differ; manual mapping required');
  const hands = [
    ['Royal Flush',10,['AS','KS','QS','JS','10S'],[14]],
    ['Straight Flush',9,['9H','8H','7H','6H','5H'],[9]],
    ['Four of a Kind',8,['AC','AD','AH','AS','KD'],[14,13]],
    ['Full House',7,['KC','KD','KH','QS','QD'],[13,12]],
    ['Flush',6,['AC','JC','9C','6C','2C'],[14,11,9,6,2]],
    ['Straight',5,['10S','9H','8D','7C','6S'],[10]],
    ['Three of a Kind',4,['8S','8H','8D','AC','KS'],[8,14,13]],
    ['Two Pair',3,['JS','JH','4D','4C','AS'],[11,4,14]],
    ['Pair',2,['QS','QH','9D','6C','3S'],[12,9,6,3]],
    ['High Card',1,['AS','JH','9D','6C','3S'],[14,11,9,6,3]],
  ];
  const fixtures = hands.map(([best_hand_name, best_hand_rank, best_hand_cards, tiebreaker], i) => {
    const finished_at = new Date(Date.now() - (10-i)*60000).toISOString();
    return { user_id: `de000000-0000-4000-a000-${String(i+1).padStart(12,'0')}`, best_hand_name, best_hand_rank, best_hand_cards, tiebreaker, started_at: new Date(Date.now()-3600000).toISOString(), finished_at, last_claim_at: finished_at };
  });
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ demo, source, waypoints: points.length, samplePlayers: fixtures.length })); return; }
  for (let i = 0; i < points.length; i++) {
    const { code, name, latitude, longitude, radius_meters, sort_order, proof_type, proof_value, is_active } = points[i];
    const values = { name, latitude, longitude, radius_meters, sort_order, proof_type, proof_value, is_active };
    if (existing.length) checked(await admin.from('waypoints').update(values).eq('id', existing[i].id).eq('event_id', demo.id));
    else checked(await admin.from('waypoints').insert({ ...values, code, event_id: demo.id }));
  }
  checked(await admin.from('runs').upsert(fixtures.map((r, i) => ({
    event_id: demo.id, user_id: r.user_id, display_name: playerNames[i],
    status: 'completed', started_at: r.started_at, finished_at: r.finished_at, last_claim_at: r.last_claim_at,
    visit_count: points.length, best_hand_name: r.best_hand_name, best_hand_rank: r.best_hand_rank,
    best_hand_cards: r.best_hand_cards, tiebreaker: r.tiebreaker,
  })), { onConflict: 'event_id,user_id' }));
  const saved = checked(await admin.from('waypoints').select('*').eq('event_id', demo.id).order('sort_order'));
  for (let i = 0; i < points.length; i++) for (const key of ['name', 'latitude', 'longitude', 'radius_meters', 'sort_order', 'proof_type', 'proof_value', 'is_active']) if (saved[i][key] !== points[i][key]) throw new Error(`Waypoint verification failed: ${key}`);
  const publicClient = createClient(url, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const board = checked(await publicClient.from('leaderboard_entries').select('*').eq('event_id', demo.id));
  const added = board.filter(r => fixtures.some(f => f.user_id === r.user_id));
  if (added.length !== 10) throw new Error('Public leaderboard verification failed');
  const players = checked(await admin.from('runs').select('display_name').eq('event_id', demo.id).in('user_id', fixtures.map(r => r.user_id)));
  if (players.length !== 10 || !players.every(r => playerNames.includes(r.display_name))) throw new Error('Demo player name verification failed');
  console.log(JSON.stringify({ event: demo.name, waypoints: saved.length, demoPlayers: added.length, totalLeaderboardEntries: board.length, verified: true }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
