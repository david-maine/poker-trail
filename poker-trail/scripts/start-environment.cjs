const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const projects = {
  production: 'bxvvwklaupkqdwosrttu',
  development: 'cjqxoubluqpupfsofjch',
};

function environmentFor(name, readFile = file => fs.readFileSync(path.join(root, file), 'utf8'), inherited = process.env) {
  if (!Object.hasOwn(projects, name)) throw new Error('Choose development or production explicitly.');
  const file = name === 'production' ? '.env.local' : '.env.dev.local';
  const settings = parseEnv(readFile(file));
  if (!settings.EXPO_PUBLIC_SUPABASE_URL || !settings.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(`Configure the Supabase URL and public key in ${file}.`);
  }
  if (new URL(settings.EXPO_PUBLIC_SUPABASE_URL).origin !== `https://${projects[name]}.supabase.co`) {
    throw new Error(`${file} must point to the ${name} Supabase project (${projects[name]}).`);
  }
  // Never inherit app settings from another environment or allow Expo dotenv overrides.
  const env = { ...inherited };
  for (const key of Object.keys(env)) {
    if (key.startsWith('EXPO_PUBLIC_') || key.startsWith('GOOGLE_MAPS_')) delete env[key];
  }
  return { ...env, ...settings, EXPO_NO_DOTENV: '1' };
}

if (require.main === module) {
  try {
    const name = process.argv[2];
    const env = environmentFor(name);
    console.log(`${name} database: ${new URL(env.EXPO_PUBLIC_SUPABASE_URL).hostname}`);
    const child = spawn(process.execPath, [require.resolve('expo/bin/cli'), 'start', ...process.argv.slice(3)], {
      cwd: root, env, stdio: 'inherit',
    });
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { environmentFor };
