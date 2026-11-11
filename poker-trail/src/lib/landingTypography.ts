export const LANDING_INPUT_FONT = "Montserrat_500Medium_Italic";
export const LANDING_BUTTON_FONT = "RobotoSlab_800ExtraBold";

export function getOrganiserHeadingSize(viewportWidth: number) {
  return 0.8 * Math.min(30, Math.max(14, 60 * Math.min(viewportWidth - 48, 1072) / 1241));
}

export function getOrganiserDetailSize(contentWidth: number) {
  return 40 * Math.min(Math.max(1, contentWidth), 360) / 1241;
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
