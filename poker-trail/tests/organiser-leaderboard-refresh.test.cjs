const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./support.cjs');

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}

test('leaderboard refreshes automatically without a button and preserves results after failed polls', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const states = [], effects = [], pending = [], requests = [];
  let stateCursor = 0, effectCursor = 0;
  const Component = loader({
    react: {
      useState(initial) {
        const i = stateCursor++;
        if (!(i in states)) states[i] = initial;
        return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
      },
      useEffect(effect, deps) {
        const i = effectCursor++, previous = effects[i];
        if (previous && deps.every((value, index) => Object.is(value, previous.deps[index]))) return;
        pending.push(() => { previous?.cleanup?.(); effects[i] = { deps, cleanup: effect() }; });
      },
    },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'Spinner', StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 1200, height: 900 }) },
    '@expo/vector-icons/Feather': { default: 'Icon' },
    'expo-font': { useFonts: () => [true] },
    '@expo-google-fonts/roboto-slab/700Bold': {},
    '@expo-google-fonts/montserrat/500Medium_Italic': {},
    '../cards/CardRow': { default: 'Cards' },
    '../../lib/organiser': { loadOrganiserLeaderboard: (eventId, signal) => new Promise((resolve, reject) => {
      requests.push({ eventId, resolve, reject });
      signal.addEventListener('abort', () => reject(Error('Aborted')), { once: true });
    }) },
  })('src/components/organiser/OrganiserLeaderboard.tsx').default;
  t.after(() => effects.forEach(effect => effect.cleanup?.()));
  function render() {
    stateCursor = 0; effectCursor = 0;
    const result = nodes(Component({ eventId: 'event' }));
    pending.splice(0).forEach(effect => effect());
    return result;
  }
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const crew = { run_id: 'run', player_label: 'Crew A', leaderboard_rank: 1, visit_count: 0, started_at: '2026-11-13T00:00:00Z' };
  assert.ok(!render().some(node => node.props?.accessibilityLabel === 'Refresh leaderboard'));
  requests[0].resolve([crew]); await tick();
  t.mock.timers.tick(10000);
  assert.equal(requests.length, 2);
  assert.ok(render().some(node => node.props?.children === 'Crew A'), 'existing results stay visible');
  requests[1].reject(Error('Offline')); await tick();
  const failed = render();
  assert.ok(failed.some(node => node.props?.accessibilityRole === 'alert'));
  assert.ok(failed.some(node => node.props?.children === 'Crew A'));
  t.mock.timers.tick(10000);
  assert.equal(requests.length, 3);
  requests[2].resolve([{ ...crew, player_label: 'Crew B' }]); await tick();
  const recovered = render();
  assert.ok(recovered.some(node => node.props?.children === 'Crew B'));
  assert.ok(!recovered.some(node => node.props?.accessibilityRole === 'alert'));
});
