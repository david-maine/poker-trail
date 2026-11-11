const test = require('node:test');
const assert = require('node:assert/strict');
const { environmentFor } = require('../scripts/start-environment.cjs');
const refs = { production: 'bxvvwklaupkqdwosrttu', development: 'cjqxoubluqpupfsofjch' };
const files = Object.fromEntries(Object.entries(refs).map(([name, ref]) => [
  name === 'production' ? '.env.local' : '.env.dev.local',
  'EXPO_PUBLIC_SUPABASE_URL=https://' + ref + '.supabase.co\nEXPO_PUBLIC_SUPABASE_ANON_KEY=' + name + '-key\nGOOGLE_MAPS_IOS_API_KEY=' + name + '-maps',
]));
const read = name => { if (!(name in files)) throw new Error('Missing file'); return files[name]; };
for (const name of Object.keys(refs)) {
  test(name + ' reads only its selected file and replaces inherited settings', () => {
    const reads = [];
    const env = environmentFor(name, file => { reads.push(file); return read(file); }, {
      PATH: 'keep', EXPO_PUBLIC_SUPABASE_URL: 'https://wrong.supabase.co',
      EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY: 'wrong-map', GOOGLE_MAPS_ANDROID_API_KEY: 'wrong-map',
    });
    assert.deepEqual(reads, [name === 'production' ? '.env.local' : '.env.dev.local']);
    assert.equal(env.EXPO_PUBLIC_SUPABASE_URL, 'https://' + refs[name] + '.supabase.co');
    assert.equal(env.EXPO_PUBLIC_SUPABASE_ANON_KEY, name + '-key');
    assert.equal(env.GOOGLE_MAPS_IOS_API_KEY, name + '-maps');
    assert.equal(env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY, undefined);
    assert.equal(env.GOOGLE_MAPS_ANDROID_API_KEY, undefined);
    assert.equal(env.PATH, 'keep');
    assert.equal(env.EXPO_NO_DOTENV, '1');
  });
  test(name + ' rejects the wrong database and missing credentials', () => {
    assert.throws(() => environmentFor(name, () => 'EXPO_PUBLIC_SUPABASE_URL=https://wrong.supabase.co\nEXPO_PUBLIC_SUPABASE_ANON_KEY=public', {}), /must point/);
    assert.throws(() => environmentFor(name, () => '', {}), /Configure/);
    assert.throws(() => environmentFor(name, () => { throw new Error('Missing file'); }, {}), /Missing file/);
  });
}
test('unknown environments cannot fall back to production', () => {
  assert.throws(() => environmentFor('staging', read, {}), /Choose/);
});
test('legacy start commands retain production and explicit dev commands use development', () => {
  const { scripts } = require('../package.json');
  for (const name of ['start', 'web', 'ios', 'android', 'prod', 'prod:web']) assert.match(scripts[name], /start-environment.cjs production/);
  for (const name of ['dev', 'dev:web']) assert.match(scripts[name], /start-environment.cjs development/);
});
