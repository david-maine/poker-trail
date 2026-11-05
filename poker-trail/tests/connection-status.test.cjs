const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./support.cjs');

test('connection indicator follows reconnect/foreground events and ignores stale or unmounted reads', async () => {
  let effect, connectionChanged, foregroundChanged, state;
  let disconnected = 0, removed = 0;
  const requests = [];
  const useConnectionStatus = loader({
    react: { useState: () => [null, value => { state = value; }], useEffect: callback => { effect = callback; } },
    'react-native': { AppState: { addEventListener: (_, callback) => {
      foregroundChanged = callback;
      return { remove: () => removed++ };
    } } },
    '../lib/connectivity': {
      addConnectivityListener: callback => { connectionChanged = callback; return () => disconnected++; },
      fetchIsUsableConnection: () => new Promise(resolve => requests.push(resolve)),
    },
  })('src/hooks/useConnectionStatus.ts').default;
  assert.equal(useConnectionStatus(), null);
  const cleanup = effect();
  connectionChanged(false);
  assert.equal(state, false);
  requests.shift()(true);
  await Promise.resolve();
  assert.equal(state, false, 'an older query must not overwrite a newer offline event');
  connectionChanged(true);
  assert.equal(state, true);
  foregroundChanged('active');
  requests.shift()(false);
  await Promise.resolve();
  assert.equal(state, false);
  foregroundChanged('active');
  cleanup();
  requests.shift()(true);
  await Promise.resolve();
  assert.equal(state, false);
  assert.equal(disconnected, 1);
  assert.equal(removed, 1);
});
