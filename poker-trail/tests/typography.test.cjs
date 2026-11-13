const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loader } = require('./support.cjs');
const { FONT_FAMILY, FONT_SIZE, TEXT_STYLE, getEventHeaderTypography, getLeaderboardTypography } = loader()('src/lib/typography.ts');

test('every themed font has a bundled asset and uses its actual font weight', () => {
  for (const family of Object.values(FONT_FAMILY)) {
    const packageName = family.startsWith('RobotoSlab') ? 'roboto-slab' : 'montserrat';
    const folder = family.split('_').slice(1).join('_');
    assert.ok(fs.statSync(path.resolve(__dirname, `../node_modules/@expo-google-fonts/${packageName}/${folder}/${family}.ttf`)).size > 1000);
  }
  for (const style of Object.values(TEXT_STYLE)) {
    assert.ok(Object.values(FONT_FAMILY).includes(style.fontFamily));
    assert.equal(style.fontWeight, '400', 'the selected font file supplies the weight');
    assert.ok(style.lineHeight > style.fontSize, 'body and UI text allow room for ascenders and descenders');
  }
  assert.ok(TEXT_STYLE.input.fontSize >= 16, 'form inputs retain a readable base size');
});

test('event metadata stays readable and the join caption remains smaller than details', () => {
  for (const width of [1, 140, 240, 360, 1120]) {
    const header = getEventHeaderTypography(width);
    assert.ok(header.detail.fontSize >= FONT_SIZE.micro);
    assert.ok(header.join.fontSize < header.detail.fontSize);
    assert.ok(header.code.fontSize > header.detail.fontSize);
    assert.ok(header.code.fontSize <= FONT_SIZE.hero);
    for (const variant of ['player', 'organiser']) {
      const board = getLeaderboardTypography(width, variant);
      assert.ok(board.name.fontSize > board.detail.fontSize);
      assert.ok(board.detail.fontSize >= FONT_SIZE.micro);
    }
  }
});
