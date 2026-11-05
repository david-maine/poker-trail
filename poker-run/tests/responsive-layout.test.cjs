const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./support.cjs');
const { getResponsiveLayout, getCardRowLayout } = loader()('src/lib/responsiveLayout.ts');
const zeroInsets = { top: 0, bottom: 0, left: 0, right: 0 };

test('responsive layouts fit narrow phones, landscape, tablets, and desktop widths', () => {
  for (const [width, height] of [[240, 480], [320, 568], [390, 844], [844, 390], [768, 1024], [1024, 768], [1440, 900], [2560, 1440]]) {
    const layout = getResponsiveLayout(width, height, zeroInsets);
    const rowWidth = Math.min(layout.contentWidth, layout.contentMaxWidth);
    const cards = getCardRowLayout(rowWidth, 5, layout.cardHeight, layout.cardGap);
    assert.ok(cards.width * 5 + cards.gap * 4 <= rowWidth + 0.001, `five cards must fit at ${width}×${height}`);
    assert.ok(Math.abs(cards.width / cards.height - 58 / 82) < 0.0001, 'cards must retain their original proportions');
    assert.ok(height - layout.handPanelHeight >= height * 0.55, 'the map retains most of the usable height');
    assert.ok(layout.controlSize >= 44 && layout.controlSize <= 56, 'map/logout controls remain tappable');
    assert.ok(layout.fieldHeight >= 48);
    assert.ok(layout.contentTop < height - layout.handPanelHeight, 'controls must fit above the deck');
    assert.ok(Number.isFinite(cards.height));
  }
});

test('height-based dimensions stay stable when only screen width changes', () => {
  const narrow = getResponsiveLayout(320, 800, zeroInsets);
  const wide = getResponsiveLayout(1440, 800, zeroInsets);
  for (const key of ['handPanelHeight', 'cardHeight', 'fieldHeight', 'controlSize', 'titleSize']) assert.equal(narrow[key], wide[key], key);
  assert.ok(wide.contentWidth > narrow.contentWidth);
});

test('safe areas and accessibility text sizes remain usable', () => {
  const insets = { top: 44, bottom: 34, left: 44, right: 12 };
  const layout = getResponsiveLayout(844, 390, insets, 2.5);
  assert.ok(layout.controlTop > insets.top);
  assert.ok(layout.left > insets.left && layout.right > insets.right);
  assert.ok(layout.bottom > insets.bottom);
  assert.ok(layout.fieldHeight >= layout.inputFontSize * 2.5 + 24, 'larger text must not be clipped inside fields/buttons');
});

test('large decks scroll horizontally instead of squeezing all cards into one screen', () => {
  const five = getCardRowLayout(320, 5, 90, 8);
  const twelve = getCardRowLayout(320, 12, 90, 8);
  assert.equal(five.scrollable, false); assert.equal(twelve.scrollable, true);
  assert.equal(twelve.width, five.width);
  assert.ok(Number.isFinite(getCardRowLayout(320, 0, 90, 8).width));
});
