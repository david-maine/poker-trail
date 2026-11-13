const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./support.cjs');

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}

async function setup({ status = 'active', capacity = 50, requestedCapacity = capacity, routeReady = true } = {}) {
  const calls = [];
  const states = []; let cursor = 0; let mounted = false;
  const effects = [];
  const Panel = loader({
    react: {
      useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; },
      useEffect(effect) { if (!mounted) effects.push(effect); },
    },
    'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: value => value } },
    'expo-router': { useLocalSearchParams: () => ({}), useRouter: () => ({ push: path => calls.push(['navigate', path]) }) },
    '@expo/vector-icons/Feather': { default: 'Icon' },
    'expo-font': { useFonts: () => [true] },
    '@expo-google-fonts/roboto-slab/400Regular': {},
    '@expo-google-fonts/roboto-slab/600SemiBold': {},
    '@expo-google-fonts/roboto-slab/700Bold': {},
    '../../lib/organiser': { setRequestedEventCapacity: async (...args) => calls.push(['capacity', ...args]), publishOrganiserEvent: async id => calls.push(['publish', id]) },
    '../../lib/eventBilling': {
      eventExpired: () => false, money: cents => '$' + cents / 100,
      createEventCheckout: async (...args) => { calls.push(['checkout', ...args]); throw new Error('Checkout opened'); },
      loadEventBilling: async () => ({ event: { player_capacity: capacity, status }, enabled: true, purchases: [], tiers: [
        { capacity: 25, amount_cents: 0 }, { capacity: 50, amount_cents: 2900 }, { capacity: 100, amount_cents: 4900 },
      ] }),
    },
  })('src/components/organiser/EventBillingPanel.tsx').default;
  const render = () => { cursor = 0; return nodes(Panel({ event: { id: 'event', status, playerCapacity: capacity, requestedCapacity }, refresh: async () => {}, routeReady })); };
  render(); mounted = true; effects.forEach(effect => effect());
  await new Promise(resolve => setImmediate(resolve));
  return { render, calls };
}

test('capacity cards disable downgrades and only offer the selected upgrade', async () => {
  const { render } = await setup();
  let tree = render();
  const cards = tree.filter(node => node.props?.accessibilityRole === 'radio');
  assert.equal(cards[0].props.disabled, true);
  assert.equal(cards[1].props.accessibilityState.checked, true);
  assert.equal(tree.some(node => node.props?.title?.startsWith('Upgrade')), false);
  cards[2].props.onPress();
  tree = render();
  assert.equal(tree.find(node => node.props?.title?.startsWith('Upgrade')).props.title, 'Upgrade · $20');
  tree.find(node => node.props?.accessibilityRole === 'radio' && node.props.accessibilityLabel.includes('50 players')).props.onPress();
  assert.equal(render().some(node => node.props?.title?.startsWith('Upgrade')), false);
});

test('draft setup publishes directly at current capacity and clears a higher requested tier', async () => {
  const { render, calls } = await setup({ status: 'draft', capacity: 25, requestedCapacity: 50 });
  render().find(node => node.props?.accessibilityRole === 'radio' && node.props.accessibilityLabel.includes('25 players')).props.onPress();
  render().find(node => node.props?.title === 'Publish event').props.onPress();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, [['capacity', 'event', 25], ['publish', 'event'], ['navigate', '/organiser/events/event']]);
});

test('draft setup opens payment for the selected paid capacity', async () => {
  const { render, calls } = await setup({ status: 'draft', capacity: 25, requestedCapacity: 50 });
  const tree = render();
  assert.equal(tree.some(node => node.props?.title === 'Publish event'), false);
  tree.find(node => node.props?.title === 'Pay & publish · $29').props.onPress();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, [['checkout', 'event', 50]]);
});

test('draft setup requires all waypoints before free or paid publication', async () => {
  for (const requestedCapacity of [25, 50]) {
    const { render } = await setup({ status: 'draft', capacity: 25, requestedCapacity, routeReady: false });
    const button = render().find(node => node.props?.title === 'Publish event' || node.props?.title?.startsWith('Pay & publish ·'));
    assert.equal(button.props.disabled, true);
  }
});
