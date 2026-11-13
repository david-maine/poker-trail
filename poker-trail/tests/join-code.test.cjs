const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./support.cjs');

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}

function card(status = 'active', overview = false) {
  const states = []; let cursor = 0;
  const routes = [];
  const dashboard = { events: [{id:'active',name:'Active trail',status:'active'}, {id:'draft',name:'Draft trail',status:'draft'}], summaries: {active:{playerCount:5},draft:{playerCount:0}} };
  const portal = loader({
    react: { createContext: () => ({}), useContext: () => ({ dashboard }), useState(initial) {
      const i = cursor++; if (!(i in states)) states[i] = initial;
      return [states[i], value => { states[i] = value; }];
    } },
    'react-native': { StyleSheet: { create: value => value }, Text: 'Text', View: 'View', Pressable: 'Pressable', useWindowDimensions: () => ({ width: 1200 }) },
    'expo-router': { Link: 'Link', useRouter: () => ({push: route => routes.push(route)}) },
    'expo-font': { useFonts: () => [true] },
    '@expo/vector-icons/Feather': { default: 'Icon' },
    '@expo-google-fonts/roboto-slab/400Regular': {},
    '@expo-google-fonts/roboto-slab/600SemiBold': {},
    '@expo-google-fonts/roboto-slab/700Bold': {},
    '@expo-google-fonts/roboto-slab/800ExtraBold': {},
    '@expo-google-fonts/montserrat/500Medium_Italic': {},
    './OrganiserWaypointEditor': {}, './OrganiserLeaderboard': {}, './EventBillingPanel': {},
    '../../lib/organiser': {}, '../../lib/organiserSupabase': {},
    '../../lib/eventBilling': { eventExpired: () => false },
  })('src/components/organiser/OrganiserPortal.tsx', '\nmodule.exports.EventCodeDetails = EventCodeDetails;');
  const Component = overview ? portal.DashboardPage : portal.EventCodeDetails;
  const render = () => { cursor = 0; return nodes(Component({ event: { status, eventCode: 'ABC123', expiresAt: '2027-01-01T00:00:00Z' }, })); };
  render.routes = routes;
  return render;
}

test('registration opens separately without opening the parent event and the code stays selectable', () => {
  const rendered = card()();
  const link = rendered.find(node => node.type === 'Link');
  assert.equal(link.props.href, '/register'); assert.equal(link.props.target, '_blank');
  let stopped = false;
  link.props.onPress({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.ok(rendered.some(node => node.props?.selectable && node.props.children === 'ABC123'));
});

test('drafts have no registration link', () => {
  assert.ok(!card('draft')().some(node => node.type === 'Link'));
});


test('event page code shows the label, bold selectable code and join link without player or expiry details', () => {
  const rendered = card('active')();
  assert.ok(rendered.some(node => node.props?.children === 'Event code'));
  assert.ok(rendered.some(node => node.type === 'Link' && node.props.target === '_blank'));
  const code = rendered.find(node => node.props?.selectable && node.props.children === 'ABC123');
  assert.equal(code.props.style.at(-1).fontSize, 24);
  assert.equal(code.props.style.at(-1).fontFamily, 'RobotoSlab_700Bold');
  assert.ok(!rendered.some(node => node.type === 'Icon' && ['users', 'clock'].includes(node.props.name)));
});


test('draft and closed split panels explain why registration is unavailable', () => {
  for (const status of ['draft', 'closed']) {
    const rendered = card(status)();
    assert.ok(!rendered.some(node => node.type === 'Link'));
    assert.ok(rendered.some(node => node.props?.children === (status === 'draft' ? 'Publish to let players join' : 'Registration is closed')));
  }
});


test('Your Events uses shared code panels and status badges, keeps counts scoped and opens the selected event', () => {
  const render = card('active', true);
  const overview = render();
  const codes = overview.filter(node => node.type?.name === 'EventCodeDetails');
  const statuses = overview.filter(node => node.type?.name === 'EventStatusIndicator');
  const summaries = overview.filter(node => node.type?.name === 'EventRegistrationDetails');
  assert.deepEqual(codes.map(node => node.props.event.id), ['active', 'draft']);
  assert.deepEqual(statuses.map(node => node.props.event.status), ['active', 'draft']);
  assert.deepEqual(summaries.map(node => node.props.playerCount), [5, 0]);
  overview.find(node => node.props?.accessibilityLabel === 'Open Active trail').props.onPress();
  overview.find(node => node.props?.accessibilityLabel === 'Create event').props.onPress();
  assert.deepEqual(render.routes, ['/organiser/events/active', '/organiser/events/new']);
});
