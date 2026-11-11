// Explicit leaderboard maintenance; preserves the removed run and its claims.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createClient } = require('@supabase/supabase-js');
const checked = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
async function main() {
  for (const file of ['.env', '.env.local']) if (fs.existsSync(file)) Object.assign(process.env, require('node:util').parseEnv(fs.readFileSync(file, 'utf8')));
  const ref = fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (new URL(url).hostname.split('.')[0] !== ref) throw new Error('Linked project mismatch');
  const keys = JSON.parse(execFileSync(path.resolve('node_modules/supabase/bin', process.platform === 'win32' ? 'supabase.exe' : 'supabase'), ['projects', 'api-keys', '--project-ref', ref, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, keys.find(k => k.name === 'service_role').api_key, options);
  const event = checked(await admin.from('events').select('id,name').eq('slug', 'south-qld-power-boat-club').single());
  const publicClient = createClient(url, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, options);
  const board = checked(await publicClient.from('leaderboard_entries').select('*').eq('event_id', event.id).order('leaderboard_rank'));
  const davids = board.filter(row => row.player_label.trim().toLowerCase() === 'david');
  console.log(JSON.stringify(davids.map(({ run_id, player_label, leaderboard_rank, best_hand_name, visit_count, started_at }) => ({ run_id, player_label, leaderboard_rank, best_hand_name, visit_count, started_at })), null, 2));
  if (!process.argv.includes('--apply')) return;
  if (process.argv.includes('--remaining')) {
    if (davids.length !== 1) throw new Error('Expected exactly one remaining David entry');
    checked(await admin.from('runs').update({ status: 'abandoned' }).eq('id', davids[0].run_id).eq('event_id', event.id).select('id').single());
    const after = checked(await publicClient.from('leaderboard_entries').select('player_label').eq('event_id', event.id));
    if (after.some(row => row.player_label.trim().toLowerCase() === 'david')) throw new Error('David still visible on leaderboard');
    console.log(JSON.stringify({ event: event.name, removedRemainingDavid: true, verified: true }));
    return;
  }
  if (davids.length !== 2) throw new Error('Expected exactly two David entries');
  const target = davids[1];
  checked(await admin.from('runs').update({ status: 'abandoned' }).eq('id', target.run_id).eq('event_id', event.id).select('id').single());
  const after = checked(await publicClient.from('leaderboard_entries').select('run_id,player_label').eq('event_id', event.id));
  if (after.some(row => row.run_id === target.run_id) || !after.some(row => row.run_id === davids[0].run_id)) throw new Error('Leaderboard removal verification failed');
  console.log(JSON.stringify({ event: event.name, removedRank: target.leaderboard_rank, retainedFirstDavid: true, verified: true }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
