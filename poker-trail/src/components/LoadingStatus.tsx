import { COLORS } from "../lib/theme";
import { ActivityIndicator, View } from "react-native";

export default function LoadingStatus({ label, color = COLORS.surface }: { label: string; color?: string }) {
  return (
    <View accessibilityLiveRegion="polite" style={{ alignItems: "center", gap: 12, padding: 24 }}>
      <ActivityIndicator accessibilityLabel={label} color={color} />
    </View>
  );
}
