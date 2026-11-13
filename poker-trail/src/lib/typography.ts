import type { TextStyle } from 'react-native';

// Font files already contain their weight. Use 400 to avoid synthetic bold on web/native.
export const FONT_FAMILY = {
  display: 'RobotoSlab_800ExtraBold',
  body: 'RobotoSlab_400Regular',
  medium: 'RobotoSlab_600SemiBold',
  bold: 'RobotoSlab_700Bold',
  detail: 'Montserrat_500Medium_Italic',
} as const;

export const FONT_SIZE = {
  micro: 10, caption: 12, small: 13, body: 14, input: 16,
  heading: 18, title: 20, price: 22, large: 24,
  display: 26, hero: 28, billboard: 34,
} as const;

export const FONT_WEIGHT = {
  regular: { fontFamily: FONT_FAMILY.body, fontWeight: '400' },
  medium: { fontFamily: FONT_FAMILY.medium, fontWeight: '400' },
  bold: { fontFamily: FONT_FAMILY.bold, fontWeight: '400' },
  display: { fontFamily: FONT_FAMILY.display, fontWeight: '400' },
} as const satisfies Record<string, TextStyle>;

export function textMetrics(fontSize: number, lineHeightRatio = 1.4): TextStyle {
  return { fontSize, lineHeight: fontSize * lineHeightRatio };
}

export const TEXT_STYLE = {
  body: { ...FONT_WEIGHT.regular, ...textMetrics(FONT_SIZE.body) },
  caption: { ...FONT_WEIGHT.regular, ...textMetrics(FONT_SIZE.caption) },
  heading: { ...FONT_WEIGHT.display, ...textMetrics(FONT_SIZE.heading) },
  title: { ...FONT_WEIGHT.display, ...textMetrics(FONT_SIZE.title) },
  label: { ...FONT_WEIGHT.medium, ...textMetrics(FONT_SIZE.caption) },
  input: { ...FONT_WEIGHT.regular, ...textMetrics(FONT_SIZE.input) },
  button: { ...FONT_WEIGHT.bold, ...textMetrics(FONT_SIZE.body) },
  detail: { fontFamily: FONT_FAMILY.detail, fontWeight: '400', ...textMetrics(FONT_SIZE.caption) },
  capacityTitle: { ...FONT_WEIGHT.medium, ...textMetrics(FONT_SIZE.body) },
  capacityPrice: { ...FONT_WEIGHT.bold, ...textMetrics(FONT_SIZE.price) },
} as const satisfies Record<string, TextStyle>;

export function getDetailFontSize(contentWidth: number) {
  return Math.max(FONT_SIZE.micro, 40 * Math.min(Math.max(1, contentWidth), 360) / 1241);
}

export function getLabelFontSize(contentWidth: number) {
  return Math.max(FONT_SIZE.body, 60 * Math.min(Math.max(1, contentWidth), 360) / 1241);
}

export function getEventHeaderTypography(contentWidth: number) {
  const detailSize = getDetailFontSize(contentWidth);
  return {
    detailSize,
    detail: textMetrics(detailSize),
    join: textMetrics(detailSize * 0.8),
    code: textMetrics(FONT_SIZE.heading),
  };
}

export function getLeaderboardTypography(contentWidth: number, variant: 'player' | 'organiser') {
  const scale = variant === 'player' ? 1.25 : 1;
  return {
    name: textMetrics(getLabelFontSize(contentWidth) * scale),
    detail: textMetrics(getDetailFontSize(contentWidth) * scale),
  };
}

// Artwork-based navigation retains its original proportions independently of UI text.
export function getPlayerTabTypography(contentWidth: number) {
  const scale = Math.min(1, contentWidth / 1241);
  return { map: Math.min(44, 88 * scale), leaderboard: Math.min(30, 60 * scale) };
}
