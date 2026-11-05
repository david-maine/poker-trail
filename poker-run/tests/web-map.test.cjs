const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./support.cjs');

test('web player map updates markers and radii without resetting the viewport', () => {
  const maps = [], markers = [], circles = [];
  class Map {
    constructor(node, options) { this.node = node; this.options = options; this.centers = []; maps.push(this); }
    setCenter(center) { this.centers.push(center); }
    setZoom(zoom) { this.zoom = zoom; }
  }
  class Marker {
    constructor(options) { Object.assign(this, options); markers.push(this); }
    setMap(map) { this.map = map; }
    setPosition(position) { this.position = position; }
    setIcon(icon) { this.icon = icon; }
  }
  class Circle {
    constructor(options) { Object.assign(this, options); circles.push(this); }
    setMap(map) { this.map = map; }
  }
  const api = { Map, Marker, Circle, SymbolPath: { CIRCLE: 0 } };
  const initial = { waypoints: [{ id: 'one', name: 'First stop', latitude: -27.47, longitude: 153.02, radiusMeters: 25 }], visited: {}, userLocation: { latitude: -27.471, longitude: 153.021 } };
  const { createPlayerMap } = loader()('src/lib/playerMap.web.ts');
  const controller = createPlayerMap(api, {}, initial);
  assert.equal(maps.length, 1); assert.equal(circles[0].radius, 25);
  assert.equal(markers[0].title, 'First stop'); assert.equal(markers[1].title, 'Your location');
  const moved = { ...initial, userLocation: { latitude: -27.472, longitude: 153.022, heading: 95 } };
  controller.update(moved);
  assert.equal(markers.length, 2, 'location changes update the existing user marker');
  assert.equal(maps[0].centers.length, 0, 'moving must not override manual panning');
  assert.deepEqual(markers[1].position, { lat: -27.472, lng: 153.022 });
  assert.equal(markers[1].icon.rotation, 95);
  controller.recenter();
  assert.deepEqual(maps[0].centers[0], { lat: -27.472, lng: 153.022 }); assert.equal(maps[0].zoom, 15);
  controller.update({ ...moved, visited: { one: true }, waypoints: [{ ...initial.waypoints[0], radiusMeters: 10 }] });
  assert.equal(maps.length, 1); assert.equal(circles[0].map, null); assert.equal(markers[0].map, null);
  assert.equal(circles[1].radius, 10); assert.equal(circles[1].fillColor, '#228b22');
  controller.destroy();
  assert.ok(markers.every(marker => marker.map === null)); assert.ok(circles.every(circle => circle.map === null));
});

test('web map loader handles server rendering, shared script loading, and retry', async t => {
  const previousWindow = global.window, previousDocument = global.document;
  const previousKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY;
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY = 'test-browser-key';
  t.after(() => {
    if (previousWindow === undefined) delete global.window; else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document; else global.document = previousDocument;
    if (previousKey === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY; else process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY = previousKey;
  });
  delete global.window; delete global.document;
  const maps = loader()('src/lib/googleMaps.web.ts');
  await assert.rejects(maps.loadGoogleMaps(), /browser/);
  const scripts = [];
  global.window = {};
  global.document = {
    getElementById: id => scripts.find(script => script.id === id && !script.removed),
    createElement: () => Object.assign(new EventTarget(), { remove() { this.removed = true; } }),
    head: { appendChild: script => scripts.push(script) },
  };
  const first = maps.loadGoogleMaps(), second = maps.loadGoogleMaps();
  assert.equal(first, second); assert.equal(scripts.length, 1);
  const failure = assert.rejects(first, /Unable to load/);
  scripts[0].dispatchEvent(new Event('error'));
  await failure;
  assert.equal(scripts[0].removed, true);
  const retry = maps.loadGoogleMaps();
  assert.equal(scripts.length, 2);
  const api = { Map() {} };
  global.window.google = { maps: api };
  scripts[1].dispatchEvent(new Event('load'));
  assert.equal(await retry, api);
  assert.equal(await maps.loadGoogleMaps(), api);
  assert.equal(scripts.length, 2, 'a loaded map API is reused across routes');
});
