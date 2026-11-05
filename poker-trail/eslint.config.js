// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: ['tests/**/*.cjs', 'scripts/**/*.cjs'],
    languageOptions: { globals: { __dirname: 'readonly' } },
  },
  {
    files: ['supabase/functions/**/*.ts'],
    rules: { 'import/no-unresolved': ['error', { ignore: ['^npm:'] }] },
  },
]);
