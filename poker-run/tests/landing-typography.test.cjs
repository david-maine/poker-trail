const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loader } = require('./support.cjs');
const { getLandingTypography } = loader()('src/lib/landingTypography.ts');

test('reference sizes are reduced by 20% and scale together for mobile forms', () => {
  const reference = getLandingTypography(835);
  assert.equal(reference.inputFontSize, 56);
  assert.equal(reference.buttonFontSize, 70.4);
  for (const width of [177, 240, 291, 380]) {
    const sizes = getLandingTypography(width);
    assert.ok(Math.abs(sizes.buttonFontSize / sizes.inputFontSize - 88 / 70) < 0.0001);
    assert.ok(sizes.minControlHeight >= sizes.inputFontSize * 1.25 + 30, 'fields must include padding and their border');
    assert.ok(sizes.minControlHeight >= sizes.buttonFontSize * 1.25 + 22, 'button must include padding and its border');
  }
  assert.ok(getLandingTypography(291, 2).minControlHeight > getLandingTypography(291).minControlHeight);
});

test('exact Medium Italic and ExtraBold font files are bundled locally', () => {
  const fonts = [
    '@expo-google-fonts/montserrat/500Medium_Italic/Montserrat_500Medium_Italic.ttf',
    '@expo-google-fonts/roboto-slab/800ExtraBold/RobotoSlab_800ExtraBold.ttf',
  ];
  for (const font of fonts) {
    const filename = path.resolve(__dirname, '../node_modules', font);
    assert.ok(fs.statSync(filename).size > 1000, `${font} must be present for native and web font loading`);
  }
});
