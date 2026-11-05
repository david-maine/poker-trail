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

test('sync pill hides saved cards, respects offline/syncing state, and opens error details', () => {
  let retried = 0;
  let online = true;
  const dialogs = [];
  const session = { syncingHand: false, retryHandSync: () => retried++, hand: {
    claims: [{ waypointId: 'first' }], acknowledgedWaypointIds: ['first'], status: 'collecting', lastSubmissionError: null,
  } };
  const HandSyncStatus = loader({
    'react-native': { ...native, Platform: { OS: 'ios' }, Alert: { alert: (...args) => dialogs.push(args) } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '../hooks/useConnectionStatus': { default: () => online },
    '../lib/eventSession': { useEventSession: () => session },
  })('src/components/HandSyncStatus.tsx').default;
  function find(node, predicate) {
    if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
    if (!node || typeof node !== 'object') return null;
    return predicate(node) ? node : find(node.props?.children, predicate);
  }
  const retryButton = node => find(node, child => child.props.accessibilityLabel === 'Retry card sync');
  const hasMessage = (node, message) => Boolean(find(node, child => child.type === 'Text' && child.props.children === message));
  assert.equal(HandSyncStatus({}), null);
  session.hand.acknowledgedWaypointIds = [];
  const pending = HandSyncStatus({});
  assert.ok(hasMessage(pending, '1 card waiting to sync'));
  retryButton(pending).props.onPress(); assert.equal(retried, 1);
  online = false;
  const offline = HandSyncStatus({});
  assert.ok(hasMessage(offline, 'Offline · 1 card pending'));
  assert.equal(retryButton(offline), undefined);
  online = true;
  assert.equal(retryButton(HandSyncStatus({})).props.disabled, false);
  session.syncingHand = true;
  const syncing = HandSyncStatus({});
  assert.ok(hasMessage(syncing, 'Syncing cards'));
  assert.equal(retryButton(syncing).props.disabled, true);
  assert.equal(retryButton(syncing).props.onPress, undefined);
  session.syncingHand = false;
  session.hand.acknowledgedWaypointIds = ['first'];
  session.hand.lastSubmissionError = 'Location proof needs a retry';
  const error = HandSyncStatus({});
  assert.ok(hasMessage(error, 'Sync issue'));
  assert.equal(hasMessage(error, session.hand.lastSubmissionError), false, 'the full error stays out of the layout');
  find(error, child => child.props.accessibilityLabel === 'Sync issue. Show details').props.onPress();
  assert.equal(dialogs[0][1], session.hand.lastSubmissionError);
  retryButton(error).props.onPress(); assert.equal(retried, 2);
  session.hand.lastSubmissionError = null;
  assert.equal(HandSyncStatus({}), null, 'the pill disappears once all claims are saved');
});
