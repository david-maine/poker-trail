const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./support.cjs');

const load = loader({
  'react-native': { ActivityIndicator: 'Spinner', Text: 'Text', View: 'View', Pressable: 'Pressable', StyleSheet: { create: value => value } },
  '@expo/vector-icons': { Ionicons: 'Icon' },
});
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}

test('shared loading screens show only a spinner with a descriptive accessible label', () => {
  const Screen = load('src/components/LoadingScreen.tsx').default;
  const Status = load('src/components/LoadingStatus.tsx').default;
  for (const tree of [Screen({ accessibilityLabel: 'Loading event' }), Status({ label: 'Loading events' })]) {
    const rendered = nodes(tree);
    assert.equal(rendered.filter(node => node.type === 'Spinner').length, 1);
    assert.ok(rendered.find(node => node.type === 'Spinner').props.accessibilityLabel.startsWith('Loading event'));
    assert.ok(!rendered.some(node => node.type === 'Text'));
  }
});

test('loading pills use spinners while errors keep their readable message', () => {
  const Pill = load('src/components/StatusPill.tsx').default;
  const pending = nodes(Pill({ loading: true, message: 'Finding location' }));
  assert.ok(pending.some(node => node.type === 'Spinner' && node.props.accessibilityLabel === 'Finding location'));
  assert.ok(!pending.some(node => node.type === 'Text'));
  const error = nodes(Pill({ loading: true, error: true, message: 'Location unavailable' }));
  assert.ok(error.some(node => node.type === 'Text' && node.props.accessibilityRole === 'alert' && node.props.children === 'Location unavailable'));
  assert.ok(!error.some(node => node.type === 'Spinner'));
});
