import { ActivityIndicator, Text, View } from "react-native";

export default function LoadingStatus({ label, color = "#ffffff", spinnerOnly = false }: { label: string; color?: string; spinnerOnly?: boolean }) {
  return (
    <View accessibilityLiveRegion="polite" style={{ alignItems: "center", gap: 12, padding: 24 }}>
      <ActivityIndicator accessibilityLabel={label} color={color} />
      {!spinnerOnly ? <Text style={{ color, textAlign: "center" }}>{label}…</Text> : null}
    </View>
  );
}
