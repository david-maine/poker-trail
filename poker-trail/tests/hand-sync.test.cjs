const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader, edgeInternals } = require('./support.cjs');

const eventId = '11111111-1111-4111-8111-111111111111';
const claim = (n, card = ['AS', 'KH', '9D', '7C', '3S'][n]) => ({ waypointId: `00000000-0000-4000-8000-00000000000${n}`, card, claimedAt: `2026-11-04T01:00:0${n}.000Z`, claimedLat: 0, claimedLng: 0, gpsAccuracyMeters: 5 });
const flush = () => new Promise(resolve => setTimeout(resolve, 25));
function localHarness() {
  const storage = new Map();
  const load = loader({ './safeStorage': { getSafeStorage: () => ({ getItem: async key => storage.get(key) ?? null, setItem: async (key, value) => { storage.set(key, value); } }) } });
  return { load, storage, local: load('src/lib/localHand.ts'), state: load('src/lib/handSyncState.ts') };
}

test('local hand migration, concurrency, and immutable reconciliation', async t => {
  await t.test('legacy pending hands retain every card; submitted hands migrate as acknowledged', async () => {
    const { local, storage } = localHarness();
    const legacy = { eventId, claims: [claim(0)], status: 'pending_submission', submittedAt: null, submissionAttemptCount: 1, lastSubmissionError: null, updatedAt: new Date().toISOString() };
    storage.set('poker-trail:local-hand:v1:' + eventId, JSON.stringify(legacy));
    assert.deepEqual((await local.getLocalHand(eventId)).acknowledgedWaypointIds, []);
    storage.set('poker-trail:local-hand:v1:' + eventId, JSON.stringify({ ...legacy, status: 'submitted' }));
    assert.deepEqual((await local.getLocalHand(eventId)).acknowledgedWaypointIds, [claim(0).waypointId]);
  });
  await t.test('acknowledging an earlier upload retains a newly collected card as pending', async () => {
    const { local, state } = localHarness();
    const empty = await local.getLocalHand(eventId);
    await local.saveLocalHand({ ...empty, claims: [claim(0), claim(1)] });
    const hand = await local.acknowledgeHand(eventId, [claim(0)], false, null);
    assert.equal(hand.claims.length, 2); assert.equal(state.pendingClaimCount(hand), 1);
    assert.equal(hand.status, 'collecting');
  });
  await t.test('concurrent collection does not lose cards or draw duplicates', async () => {
    const { local } = localHarness();
    const input = n => ({ eventId, waypointId: claim(n).waypointId, claimedLat: 0, claimedLng: 0, gpsAccuracyMeters: 5 });
    await Promise.all([local.addLocalCardClaim(input(0)), local.addLocalCardClaim(input(1)), local.addLocalCardClaim(input(0))]);
    const hand = await local.getLocalHand(eventId);
    assert.equal(hand.claims.length, 2); assert.equal(new Set(hand.claims.map(c => c.card)).size, 2);
  });
  await t.test('server restoration merges missing cards without redrawing; conflicts preserve local data', async () => {
    const { local } = localHarness();
    const restored = await local.acknowledgeHand(eventId, [claim(0)], false, null);
    assert.deepEqual(restored.claims, [claim(0)]);
    await assert.rejects(local.acknowledgeHand(eventId, [claim(0, '2S')], false, null), /conflicts/);
    assert.deepEqual((await local.getLocalHand(eventId)).claims, [claim(0)]);
    const completed = await local.acknowledgeHand(eventId, [claim(0)], true, '2026-11-04T02:00:00Z');
    assert.equal(completed.status, 'submitted');
    await assert.rejects(local.addLocalCardClaim({ eventId, waypointId: claim(1).waypointId }), /already been submitted/);
  });
  await t.test('revisiting a rejected waypoint refreshes only its GPS proof and keeps the original card', async () => {
    const { local } = localHarness();
    await local.saveLocalHand({ ...await local.getLocalHand(eventId), claims: [claim(0)] });
    await local.recordSyncFailure(eventId, 'Outside the new radius', false, [claim(0).waypointId]);
    const result = await local.addLocalCardClaim({ eventId, waypointId: claim(0).waypointId, claimedLat: 0.001, claimedLng: 0.002, gpsAccuracyMeters: 3 });
    assert.equal(result.claim.card, 'AS'); assert.equal(result.hand.claims.length, 1);
    assert.equal(result.claim.claimedLat, 0.001); assert.equal(result.claim.gpsAccuracyMeters, 3);
    assert.deepEqual(result.hand.rejectedWaypointIds, []); assert.equal(result.hand.lastSubmissionError, null);
    assert.notEqual(result.claim.claimedAt, claim(0).claimedAt);
    await local.acknowledgeHand(eventId, [result.claim], false, null);
    await local.recordSyncFailure(eventId, 'Unexpected stale rejection', false, [claim(0).waypointId]);
    const accepted = await local.addLocalCardClaim({ eventId, waypointId: claim(0).waypointId, claimedLat: 5, claimedLng: 5, gpsAccuracyMeters: 3 });
    assert.equal(accepted.claim.claimedLat, 0.001, 'accepted proofs must never be changed');
  });
});

test('server scoring agrees with client scoring and accepts validated partial hands', () => {
  const edge = edgeInternals();
  const client = loader()('src/lib/cards.ts');
  const fixtures = [[], ['AS'], ['AS', 'AH'], ['AS', 'AH', 'AD'], ['AS', 'AH', 'AD', 'AC'], ['2S', '3S', '4S', '5S', 'AS'], ['AS', 'KH', '9D', '7C', '3S'], ['AS', 'KS', 'QS', 'JS', '10S', '2H']];
  for (const cards of fixtures) assert.deepEqual(edge.evaluateBestHand(cards), client.evaluateBestHand(cards));
  const waypoints = Array.from({ length: 5 }, (_, n) => ({ id: claim(n).waypointId, latitude: 0, longitude: 0, radius_meters: 100 }));
  const partial = [claim(0), claim(1)];
  assert.equal(edge.validatePayload({ eventId, claims: partial }), null);
  assert.equal(edge.validateHand(partial, waypoints), null);
  assert.match(edge.validateHand([claim(0), claim(0)], waypoints), /same waypoint/);
  assert.match(edge.validateHand([claim(0), claim(1, 'AS')], waypoints), /same card/);
  assert.match(edge.validateHand([{ ...claim(0), claimedLat: 1 }], waypoints), /outside/);
  assert.match(edge.validateHand([{ ...claim(0), gpsAccuracyMeters: 100 }], waypoints), /accuracy/);
  assert.match(edge.validateHand([{ ...claim(0), waypointId: 'unknown' }], waypoints), /not active/);
  assert.match(edge.validatePayload({ eventId, claims: [{ ...claim(0), claimedLat: Infinity }] }), /claimedLat/);
  assert.match(edge.validatePayload({ eventId, claims: [{ ...claim(0), gpsAccuracyMeters: -1 }] }), /gpsAccuracy/);
  assert.match(edge.validateEventTiming({ status: 'closed' }, partial), /not currently accepting/);
  assert.match(edge.validateEventTiming({ status: 'active', ends_at: '2026-11-03T00:00:00Z' }, partial), /already ended/);
  const oldClaim = { ...claim(0), claimedLat: 0.001 };
  const shrunkWaypoint = [{ ...waypoints[0], radius_meters: 5, name: 'Edited waypoint' }];
  assert.match(edge.validateHand([oldClaim], shrunkWaypoint), /Edited waypoint.*5 m radius.*112 m away/);
  assert.equal(edge.validateHand([oldClaim], shrunkWaypoint, [oldClaim]), null, 'accepted claims survive later radius changes');
  assert.match(edge.validateHand([{ ...oldClaim, claimedLng: 1 }], shrunkWaypoint, [oldClaim]), /outside/, 'altered proofs are not exempt');
});

test('session worker syncs offline cards after reconnect and drains cards collected during upload', async t => {
  const storage = new Map(), appListeners = new Set(), networkListeners = new Set();
  let online = false, holdUpload, rejectProof = false, uploads = [], activeUploads = 0, maxUploads = 0;
  const load = loader({
    './safeStorage': { getSafeStorage: () => ({ getItem: async key => storage.get(key) ?? null, setItem: async (key, value) => { storage.set(key, value); } }) },
    'react-native': { AppState: { addEventListener: (_, listener) => { appListeners.add(listener); return { remove: () => appListeners.delete(listener) }; } } },
    './connectivity': {
      fetchIsUsableConnection: async () => online,
      addConnectivityListener: listener => { networkListeners.add(listener); return () => networkListeners.delete(listener); },
    },
    './game': {
      loadAcceptedHand: async () => ({ claims: [], completed: false, finishedAt: null }),
      isRetryableHandSubmissionError: error => error.retryable === true,
      syncHand: async (_, claims) => {
        activeUploads++; maxUploads = Math.max(maxUploads, activeUploads);
        uploads.push(claims);
        if (rejectProof) {
          activeUploads--;
          throw Object.assign(new Error('Outside the new radius'), { retryable: false, rejectedWaypointIds: [claim(2).waypointId] });
        }
        if (holdUpload) await new Promise(resolve => { holdUpload = resolve; });
        activeUploads--;
        return { claims, run: { status: claims.length === 5 ? 'completed' : 'active', finishedAt: null } };
      },
    },
  });
  const local = load('src/lib/localHand.ts');
  await local.saveLocalHand({ ...await local.getLocalHand(eventId), claims: [claim(0)] });
  const worker = load('src/lib/handSync.ts').startHandSync(eventId, () => {}, () => {});
  t.after(() => worker.stop());
  await flush();
  assert.equal(uploads.length, 0);
  assert.match((await local.getLocalHand(eventId)).lastSubmissionError, /Offline/);
  online = true;
  holdUpload = true;
  for (const listener of networkListeners) listener(true);
  await flush();
  assert.equal(uploads.length, 1);
  await local.saveLocalHand({ ...await local.getLocalHand(eventId), claims: [claim(0), claim(1)] });
  await flush();
  const release = holdUpload; holdUpload = null; release();
  await flush(); await flush();
  assert.equal(uploads.length, 2); assert.equal(uploads[1].length, 2);
  assert.equal(maxUploads, 1);
  assert.equal((await local.getLocalHand(eventId)).acknowledgedWaypointIds.length, 2);
  rejectProof = true;
  await local.saveLocalHand({ ...await local.getLocalHand(eventId), claims: [claim(0), claim(1), claim(2)] });
  await flush(); await flush();
  assert.deepEqual((await local.getLocalHand(eventId)).rejectedWaypointIds, [claim(2).waypointId]);
  rejectProof = false;
  await local.addLocalCardClaim({ eventId, waypointId: claim(2).waypointId, claimedLat: 0, claimedLng: 0, gpsAccuracyMeters: 3 });
  await flush(); await flush();
  const repaired = await local.getLocalHand(eventId);
  assert.equal(repaired.acknowledgedWaypointIds.length, 3, 'a fresh proof automatically resumes a permanently rejected sync');
  assert.equal(repaired.claims[2].card, '9D', 'recovery must keep the original card');
  worker.stop(); assert.equal(networkListeners.size, 0); assert.equal(appListeners.size, 0);
});
