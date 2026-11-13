const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./support.cjs');

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}

function editor(disabled = false) {
  const selections = [], changes = [];
  const Component = loader({
    react: { useState: initial => [initial, () => {}] },
    'react-native': { Text: 'Text', View: 'View', Pressable: 'Pressable', TextInput: 'Input', StyleSheet: { create: value => value } },
    '@expo/vector-icons/Feather': { default: 'Icon' },
    './OrganiserWaypointMap': { default: 'Map' },
  })('src/components/organiser/OrganiserWaypointEditor.tsx').default;
  const rendered = nodes(Component({
    selectedSlotIndex: 1, disabled,
    draft: { latitude: '-27', longitude: '153', radius: '30' },
    waypoints: [{ sortOrder: 0 }, { sortOrder: 3 }],
    onSelect: index => selections.push(index), onChange: draft => changes.push(draft),
  }));
  return { rendered, selections, changes, tabs: rendered.filter(node => node.props?.accessibilityRole === 'tab'), map: rendered.find(node => node.type === 'Map') };
}

test('waypoint selector sits before the map and announces locations already set without tick icons', () => {
  const { rendered, tabs, map, selections } = editor();
  assert.ok(rendered.findIndex(node => node.props?.accessibilityRole === 'tablist') < rendered.indexOf(map));
  assert.equal(tabs.length, 5);
  assert.deepEqual(tabs.map(tab => tab.props.accessibilityState.selected), [false, true, false, false, false]);
  assert.deepEqual(tabs.filter(tab => tab.props.accessibilityLabel.endsWith(', set')).map(tab => tab.props.accessibilityLabel), ['Waypoint 1, set', 'Waypoint 4, set']);
  assert.ok(!rendered.some(node => node.type === 'Icon' && node.props.name === 'check'));
  tabs[1].props.onPress(); tabs[3].props.onPress();
  assert.deepEqual(selections, [3]);
});

test('disabled waypoint editing blocks switching and map picks, while enabled picks preserve radius', () => {
  const locked = editor(true);
  locked.tabs[3].props.onPress(); locked.map.props.onPick({ latitude: -28, longitude: 152 });
  assert.deepEqual(locked.selections, []); assert.deepEqual(locked.changes, []);
  assert.ok(locked.tabs.every(tab => tab.props.disabled));
  assert.ok(locked.rendered.filter(node => node.type === 'Input').every(node => node.props.editable === false));
  const active = editor();
  active.map.props.onPick({ latitude: -28, longitude: 152 });
  assert.deepEqual(active.changes, [{ latitude: '-28', longitude: '152', radius: '30' }]);
});
