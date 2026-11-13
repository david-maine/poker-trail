import { FONT_FAMILY } from "./typography";
export { FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, TEXT_STYLE, textMetrics } from "./typography";

export const COLORS = {
  brand: '#2b7338', surface: '#ffffff', organiserBackground: '#F5F4EF', ink: '#080706',
  text: '#153c2a', muted: '#4c5c50', primary: '#256444',
  selected: '#e4efe1', border: '#a2b6a5', subtleBorder: '#dce4d8',
  error: '#8a4520', danger: '#b42318', inactive: '#6b7280', neutralSurface: '#f0f1f0',
} as const;

export const APP_BACKGROUND_COLOR = COLORS.brand;
export const TRAIL_INK = COLORS.ink;
export const TRAIL_WHITE = COLORS.surface;
export const TRAIL_DISPLAY_FONT = FONT_FAMILY.display;
export const TRAIL_BODY_FONT = FONT_FAMILY.body;
