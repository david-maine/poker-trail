import { StyleSheet } from "react-native";
import { TRAIL_WHITE } from "../lib/theme";
import { FONT_WEIGHT } from '../lib/typography';

export const statusPillStyles = StyleSheet.create({
  pill: {
    flexDirection: "row", alignItems: "center", alignSelf: "center", maxWidth: "100%",
    backgroundColor: TRAIL_WHITE, borderRadius: 28, borderWidth: 1, borderColor: "#d7e3d9",
    paddingHorizontal: 6, elevation: 4, shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 4,
  },
  error: { backgroundColor: "#fff3f0", borderColor: "#edb4aa" },
  offline: { backgroundColor: "#fff7df", borderColor: "#e6ce92" },
  status: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 6, paddingVertical: 6, minHeight: 44, flexShrink: 1 },
  text: { ...FONT_WEIGHT.medium, flexShrink: 1 },
  retry: { minHeight: 44, justifyContent: "center", paddingHorizontal: 10, paddingVertical: 6, borderLeftWidth: 1, borderLeftColor: "#d7d7d7" },
  disabled: { opacity: 0.4 },
});
