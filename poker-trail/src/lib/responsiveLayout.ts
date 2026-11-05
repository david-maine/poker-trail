export type ScreenInsets = { top: number; bottom: number; left: number; right: number };
export type MapControlLayout = { top: number; left: number; size: number };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function getResponsiveLayout(width: number, height: number, insets: ScreenInsets, fontScale = 1) {
  const usableHeight = Math.max(1, height - insets.top - insets.bottom);
  const usableWidth = Math.max(1, width - insets.left - insets.right);
  const gutter = clamp(usableWidth * 0.045, 12, 32);
  const gap = clamp(usableHeight * 0.016, 8, 18);
  const controlSize = clamp(usableHeight * 0.07, 44, 56);
  const controlTop = insets.top + clamp(usableHeight * 0.025, 10, 24);
  const inputFontSize = clamp(usableHeight * 0.025, 16, 20);
  return {
    width, height, fontScale, gutter, gap,
    left: insets.left + gutter,
    right: insets.right + gutter,
    bottom: insets.bottom + gap,
    contentWidth: Math.max(1, usableWidth - gutter * 2),
    contentMaxWidth: 720,
    controlSize, controlTop,
    contentTop: controlTop + controlSize + gap,
    control: { top: controlTop, left: insets.left + gutter, size: controlSize } as MapControlLayout,
    inputFontSize,
    fieldHeight: Math.max(clamp(usableHeight * 0.075, 48, 72), inputFontSize * fontScale + 24),
    titleSize: clamp(usableHeight * 0.048, 28, 48),
    titleGap: clamp(usableHeight * 0.05, 16, 44),
    headingSize: clamp(usableHeight * 0.03, 18, 28),
    playerNameSize: clamp(usableHeight * 0.033, 18, 28),
    detailSize: clamp(usableHeight * 0.018, 12, 15),
    cardHeight: clamp(usableHeight * 0.12, 42, 120),
    cardGap: clamp(usableWidth * 0.018, 4, 12),
    handPanelHeight: Math.min(clamp(usableHeight * 0.28, 120, 300), usableHeight * 0.45),
    footerMaxHeight: clamp(usableHeight * 0.3, 72, 220),
  };
}

// Five visible cards; longer event decks scroll instead of squeezing or overflowing.
export function getCardRowLayout(width: number, total: number, maxHeight: number, gap: number) {
  const columns = Math.max(1, Math.min(5, total));
  const cardWidth = Math.max(1, Math.min(maxHeight * 58 / 82, (width - gap * (columns - 1)) / columns));
  return { width: cardWidth, height: cardWidth * 82 / 58, gap, scrollable: total > 5 };
}
