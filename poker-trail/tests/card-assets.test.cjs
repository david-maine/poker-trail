const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('every card has a display copy with bounded decoded memory and preserved proportions', () => {
  const root = path.resolve(__dirname, '../assets/images/cards');
  const originals = fs.readdirSync(root).filter(name => name.endsWith('.png'));
  assert.equal(originals.length, 54);
  let decodedBytes = 0;
  for (const name of originals) {
    const source = fs.readFileSync(path.join(root, name));
    const display = fs.readFileSync(path.join(root, 'display', name));
    const width = display.readUInt32BE(16), height = display.readUInt32BE(20);
    assert.ok(width > 0 && width <= 320, name);
    assert.ok(height > 0 && height <= 500, name);
    assert.equal(display[25], 6, `${name} retains RGBA transparency`);
    const expectedHeight = source.readUInt32BE(20) * width / source.readUInt32BE(16);
    assert.ok(Math.abs(height - expectedHeight) <= 1, `${name} preserves proportions`);
    decodedBytes += width * height * 4;
  }
  assert.ok(decodedBytes < 32 * 1048576, 'the entire display deck stays below 32 MiB');
});

test('card renderers only reference the display-sized card images', () => {
  for (const name of ['src/lib/cardImages.ts']) {
    const source = fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');
    const references = [...source.matchAll(/assets\/images\/cards\/([^"']+)/g)];
    assert.ok(references.length, name);
    assert.ok(references.every(match => match[1].startsWith('display/')), name);
  }
});

test('web card faces and back are self-contained and match the optimized PNGs', () => {
  const { loader } = require('./support.cjs');
  const { CARD_IMAGES, CARD_BACK_IMAGE } = loader()('src/lib/cardImages.web.ts');
  assert.equal(Object.keys(CARD_IMAGES).length, 52);
  for (const [name, source] of Object.entries({...CARD_IMAGES, 'card-back':CARD_BACK_IMAGE})) {
    assert.ok(source.uri.startsWith('data:image/png;base64,'), `${name} needs no network request`);
    const actual = Buffer.from(source.uri.split(',')[1], 'base64');
    assert.deepEqual(actual, fs.readFileSync(path.resolve(__dirname, '../assets/images/cards/display', name+'.png')));
  }
});

test('a collected card remains identifiable when its image fails to load', () => {
  const { loader } = require('./support.cjs');
  let failed = null;
  const Card = loader({
    './CardImage': {default:'Image'},
    react: {default:{}, useState:()=>[failed, value=>{failed=value;}]},
    'react-native': {View:'View',Text:'Text',Image:'Image',StyleSheet:{create:value=>value}},
    '../lib/cardImages': {CARD_IMAGES:{'ace-of-hearts':{uri:'offline-image'}}},
  })('src/components/PlayingCard.tsx').default;
  const image = Card({card:'AH'}).props.children;
  image.props.onError();
  const fallback = Card({card:'AH'});
  assert.equal(fallback.props.accessibilityLabel,'Ace of hearts');
  assert.equal(fallback.props.children.type,'Text');
  assert.equal(fallback.props.children.props.children,'Ace of hearts');
  assert.equal(Card({card:'2H'}).props.children.props.children,'Two of hearts');
});

test('native deck warming deduplicates requests and retries failed prefetches', async () => {
  const { loader } = require('./support.cjs');
  const calls=[];
  let success=false;
  function CachedImage() {}
  CachedImage.prefetch=async (...args)=>{calls.push(args);return success;};
  const native=loader({
    'expo-image': {Image:CachedImage},
    'react-native': {Image:{resolveAssetSource:source=>({uri:'asset:'+source})}},
    '../lib/cardImages': {CARD_IMAGES:{ace:1,king:2},CARD_BACK_IMAGE:3},
  })('src/components/CardImage.native.tsx');
  const first=native.preloadCardImages();
  assert.equal(native.preloadCardImages(),first);
  await first;
  success=true;
  await native.preloadCardImages();
  await native.preloadCardImages();
  assert.equal(calls.length,2);
  assert.deepEqual(calls[0],[['asset:1','asset:2','asset:3'],{cachePolicy:'memory-disk'}]);
  const image=native.default({source:1});
  assert.equal(image.props.cachePolicy,'memory-disk');
  assert.equal(image.props.transition,0);
});
