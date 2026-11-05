import { ActivityIndicator, Text, View } from "react-native";

export default function LoadingStatus({ label, color = "#ffffff" }: { label: string; color?: string }) {
  return (
    <View accessibilityLiveRegion="polite" style={{ alignItems: "center", gap: 12, padding: 24 }}>
      <ActivityIndicator color={color} />
      <Text style={{ color, textAlign: "center" }}>{label}…</Text>
    </View>
  );
}
