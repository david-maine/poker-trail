const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./support.cjs');

const native = {
  Platform: { OS: 'web' },
  Pressable: 'Pressable', Text: 'Text', View: 'View',
  StyleSheet: { create: value => value },
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
};

test('reference-style bottom tabs preserve selection, navigation and cancellable tab events', () => {
  const TrailTabBar = loader({
    'react-native': native,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }) },
  })('src/components/TrailTabBar.tsx').default;
  let prevented = false;
  const events = [], navigations = [];
  const props = {
    state: { index: 0, routes: [{ key: 'map', name: 'index' }, { key: 'board', name: 'leaderboard' }] },
    descriptors: { map: { options: {} }, board: { options: {} } },
    navigation: {
      emit: event => { events.push(event); return { defaultPrevented: prevented }; },
      navigate: (...args) => navigations.push(args),
    },
  };
  const tabs = TrailTabBar(props).props.children;
  assert.equal(tabs.length, 2);
  assert.equal(tabs[0].props.accessibilityState.selected, true);
  assert.equal(tabs[1].props.accessibilityState.selected, false);
  const [mapLabel, boardLabel] = tabs.map(tab => tab.props.children);
  assert.equal(mapLabel.props.style[0].fontFamily, 'RobotoSlab_800ExtraBold');
  assert.equal(boardLabel.props.style[0].fontFamily, 'RobotoSlab_800ExtraBold');
  assert.ok(Math.abs(mapLabel.props.style[1].fontSize - 88 * 390 / 1241) < 0.0001);
  assert.ok(Math.abs(boardLabel.props.style[1].fontSize - 60 * 390 / 1241) < 0.0001);
  tabs[0].props.onPress(); assert.equal(navigations.length, 0, 'pressing the selected tab does not navigate again');
  tabs[1].props.onPress(); assert.deepEqual(navigations, [['leaderboard', undefined]]);
  prevented = true; tabs[1].props.onPress(); assert.equal(navigations.length, 1);
  tabs[1].props.onLongPress(); assert.equal(events.at(-1).type, 'tabLongPress');
});

test('minimal reference layout hides saved status but keeps pending cards, failures and Retry visible', () => {
  let retried = 0;
  const session = { syncingHand: false, retryHandSync: () => retried++, hand: {
    claims: [{ waypointId: 'first' }], acknowledgedWaypointIds: ['first'], status: 'collecting', lastSubmissionError: null,
  } };
  const HandSyncStatus = loader({ 'react-native': native, '../lib/eventSession': { useEventSession: () => session } })('src/components/HandSyncStatus.tsx').default;
  assert.equal(HandSyncStatus({ hideWhenSaved: true }), null);
  session.hand.acknowledgedWaypointIds = [];
  const pending = HandSyncStatus({ hideWhenSaved: true });
  assert.ok(pending);
  pending.props.children[1].props.onPress(); assert.equal(retried, 1);
  session.hand.acknowledgedWaypointIds = ['first'];
  session.hand.lastSubmissionError = 'Location proof needs a retry';
  assert.ok(HandSyncStatus({ hideWhenSaved: true }), 'errors remain visible even with no pending claims');
});
