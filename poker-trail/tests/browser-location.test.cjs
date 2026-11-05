const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./support.cjs');
const { startBrowserLocation } = loader()('src/lib/browserLocation.ts');

function harness() {
  const positions = [], errors = [], cleared = [];
  let success, failure, options, timeout, cancelled = false;
  const geolocation = {
    watchPosition(onSuccess, onError, settings) { success = onSuccess; failure = onError; options = settings; return 0; },
    clearWatch(id) { cleared.push(id); },
  };
  const stop = startBrowserLocation({ geolocation, secureContext: true }, position => positions.push(position), error => errors.push(error),
    (callback, delay) => { assert.equal(delay, 15000); timeout = callback; return () => { cancelled = true; }; });
  return { positions, errors, cleared, stop, success: position => success(position), fail: code => failure({ code }),
    expire: () => { if (!cancelled) timeout(); }, options: () => options };
}

test('insecure mobile URLs and unsupported browsers produce actionable errors immediately', () => {
  let message = '', requested = false;
  startBrowserLocation({ secureContext: false, geolocation: { watchPosition() { requested = true; }, clearWatch() {} } }, () => {}, error => { message = error; });
  assert.match(message, /HTTPS/); assert.equal(requested, false);
  startBrowserLocation({ secureContext: true }, () => {}, error => { message = error; });
  assert.match(message, /not available in this browser/);
});

test('an unanswered permission prompt stops looking like an indefinite load and can recover later', () => {
  const watch = harness();
  assert.deepEqual(watch.options(), { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  watch.expire();
  assert.match(watch.errors[0], /Allow location access.*Retry location/);
  const position = { timestamp: Date.now(), coords: { latitude: -27.47, longitude: 153.02, accuracy: 10 } };
  watch.success(position);
  assert.equal(watch.positions[0], position, 'granting permission after the timeout still delivers a real position');
  watch.stop(); assert.deepEqual(watch.cleared, [0]);
});

test('browser permission, unavailable-position and timeout errors reach the app', () => {
  for (const [code, expected] of [[1, /access is blocked/], [2, /could not determine/], [3, /timed out/]]) {
    const watch = harness();
    watch.fail(code); watch.expire();
    assert.equal(watch.errors.length, 1, 'a watchdog must not overwrite the specific browser error');
    assert.match(watch.errors[0], expected);
    watch.stop();
  }
});

test('retry/unmount cleanup clears the old watch and ignores late callbacks', () => {
  const watch = harness(); watch.stop(); watch.expire(); watch.fail(1);
  watch.success({ coords: { latitude: 0, longitude: 0 } });
  assert.deepEqual(watch.cleared, [0]); assert.equal(watch.errors.length, 0); assert.equal(watch.positions.length, 0);
  const retry = harness(); retry.success({ coords: { latitude: 0, longitude: 0 } });
  assert.equal(retry.positions.length, 1); retry.stop();
});

test('invalid coordinates and synchronous browser failures do not leave a hanging request', () => {
  const watch = harness(); watch.success({ coords: { latitude: NaN, longitude: 0 } });
  assert.match(watch.errors[0], /invalid location/); assert.equal(watch.positions.length, 0); watch.stop();
  let message = '';
  const cleanup = startBrowserLocation({ secureContext: true, geolocation: { watchPosition() { throw new Error('unavailable'); }, clearWatch() {} } },
    () => {}, error => { message = error; });
  assert.match(message, /Unable to start/); cleanup();
});
