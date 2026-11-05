const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./support.cjs');

function registrationScreen(existing, platform = 'ios') {
  const values = [];
  let cursor = 0;
  const registeredNames = [], sessions = [], routes = [], dialogs = [];
  const event = { id: 'event', eventCode: '6URBLA', name: 'Poker Trail' };
  const initial = { event: null, isRegistered: true, requiresRegistration: false };
  const Register = loader({
    react: {
      useState: initialValue => {
        const index = cursor++;
        if (!(index in values)) values[index] = initialValue;
        return [values[index], next => { values[index] = next; }];
      },
      useRef: current => ({ current }), useEffect() {},
    },
    'react-native': {
      Platform: { OS: platform }, Keyboard: { dismiss() {} },
      Alert: { alert: (...args) => dialogs.push(args) },
      KeyboardAvoidingView: 'KeyboardAvoidingView', Pressable: 'Pressable',
      ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View',
      StyleSheet: { create: value => value },
    },
    'expo-router': { router: { replace: route => routes.push(route) } },
    'expo-font': { useFonts: () => [true, null] },
    '@expo-google-fonts/montserrat/500Medium_Italic': { Montserrat_500Medium_Italic: 1 },
    '@expo-google-fonts/roboto-slab/800ExtraBold': { RobotoSlab_800ExtraBold: 2 },
    '../src/components/TrailBrandArtwork': { default: 'Artwork' },
    '../src/components/LoadingScreen': { default: 'Loading' },
    '../src/hooks/useResponsiveLayout': { default: () => ({ width: 390, height: 844, contentWidth: 354, fontScale: 1, fieldHeight: 60, gap: 12 }) },
    '../src/lib/eventSession': { useEventSession: () => ({ registrationState: initial, setRegistrationState: state => sessions.push(state) }) },
    '../src/lib/game': {
      loadRegistrationStateForEventCode: async () => ({ event, isRegistered: Boolean(existing), requiresRegistration: !existing, vesselName: existing }),
      registerVesselNameForEvent: async (_, vesselName) => {
        registeredNames.push(vesselName);
        return { event, vesselName, isRegistered: true, requiresRegistration: false };
      },
    },
  })('app/register.tsx').default;
  const render = () => { cursor = 0; return Register(); };
  return { render, registeredNames, sessions, routes, dialogs };
}

function find(node, predicate) {
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
  if (!node || typeof node !== 'object') return null;
  return predicate(node) ? node : find(node.props?.children, predicate);
}

async function join(screen) {
  let tree = screen.render();
  find(tree, node => node.props.accessibilityLabel === 'Event code').props.onChangeText('6URBLA');
  find(tree, node => node.props.accessibilityLabel === 'Vessel name').props.onChangeText('New Name');
  tree = screen.render();
  find(tree, node => node.props.accessibilityLabel === 'Join the hunt').props.onPress();
  await new Promise(resolve => setImmediate(resolve));
  return screen.render();
}

for (const platform of ['ios', 'android']) {
  test(`rejoining on ${platform} waits for the system dialog before resuming`, async () => {
    const screen = registrationScreen('Original Name', platform);
    await join(screen);
    assert.equal(screen.dialogs.length, 1);
    assert.equal(screen.dialogs[0][1], 'You have already joined this event as Original Name');
    assert.deepEqual(screen.registeredNames, []);
    assert.deepEqual(screen.sessions, []);
    assert.deepEqual(screen.routes, []);
    screen.dialogs[0][2][0].onPress();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(screen.sessions[0].vesselName, 'Original Name');
    assert.deepEqual(screen.routes, ['/(tabs)']);
  });
}

test('rejoining on web uses the browser system alert before resuming', async t => {
  const screen = registrationScreen('Original Name', 'web');
  const originalAlert = globalThis.alert;
  const messages = [];
  globalThis.alert = message => {
    messages.push(message);
    assert.deepEqual(screen.sessions, []);
    assert.deepEqual(screen.routes, []);
  };
  t.after(() => {
    if (originalAlert === undefined) delete globalThis.alert;
    else globalThis.alert = originalAlert;
  });
  await join(screen);
  assert.deepEqual(messages, ['You have already joined this event as Original Name']);
  assert.deepEqual(screen.dialogs, []);
  assert.deepEqual(screen.registeredNames, []);
  assert.equal(screen.sessions[0].vesselName, 'Original Name');
  assert.deepEqual(screen.routes, ['/(tabs)']);
});

test('first-time joining registers the entered name without a rejoin notice', async () => {
  const screen = registrationScreen(null);
  await join(screen);
  assert.deepEqual(screen.dialogs, []);
  assert.deepEqual(screen.registeredNames, ['New Name']);
  assert.equal(screen.sessions[0].vesselName, 'New Name');
  assert.deepEqual(screen.routes, ['/(tabs)']);
});
