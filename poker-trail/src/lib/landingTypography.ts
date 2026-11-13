import { FONT_FAMILY, FONT_SIZE, getDetailFontSize, getLabelFontSize } from "./typography";

export const LANDING_INPUT_FONT = FONT_FAMILY.detail;
export const LANDING_BUTTON_FONT = FONT_FAMILY.display;

export function getOrganiserHeadingSize(viewportWidth: number) {
  return Math.max(FONT_SIZE.body, 0.8 * Math.min(30, 60 * Math.min(viewportWidth - 48, 1072) / 1241));
}

export function getOrganiserDetailSize(contentWidth: number) {
  return getDetailFontSize(contentWidth);
}

// The reference artwork's outlined form is approximately 835 design points wide.
// Scale the original 70pt / 88pt typography down by 20%, then scale the form
// uniformly on smaller displays rather than clipping desktop-sized text.
export function getLandingTypography(formWidth: number, fontScale = 1) {
  const scale = Math.max(1, formWidth) / 835;
  const inputFontSize = 70 * 0.8 * scale;
  const buttonFontSize = 88 * 0.8 * scale;
  return {
    inputFontSize,
    buttonFontSize,
    minControlHeight: Math.max(inputFontSize * fontScale * 1.25 + 30, buttonFontSize * fontScale * 1.25 + 22),
  };
}

export function getOrganiserLabelSize(contentWidth: number) {
  return getLabelFontSize(contentWidth);
}
