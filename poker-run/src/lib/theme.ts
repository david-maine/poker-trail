import { Platform } from "react-native";

export const APP_BACKGROUND_COLOR = "#2b7338";
export const TRAIL_INK = "#080706";
export const TRAIL_WHITE = "#ffffff";
export const TRAIL_DISPLAY_FONT = Platform.OS === "android" ? "serif" : "Georgia";
export const TRAIL_BODY_FONT = Platform.OS === "ios" ? "Arial" : "sans-serif";
