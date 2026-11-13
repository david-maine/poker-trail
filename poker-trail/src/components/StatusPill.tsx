import { FONT_SIZE } from "../lib/typography";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { COLORS, APP_BACKGROUND_COLOR } from "../lib/theme";
import { statusPillStyles as styles } from "./statusPillStyles";

type Props = {
  message: string;
  error?: boolean;
  loading?: boolean;
  icon?: "map-outline" | "location-outline";
  fontSize?: number;
  onRetry?: () => void;
  retryLabel?: string;
};

export default function StatusPill({ message, error = false, loading = false, icon = "map-outline", fontSize = FONT_SIZE.small, onRetry, retryLabel = "Retry" }: Props) {
  const color = error ? COLORS.danger : APP_BACKGROUND_COLOR;
  return (
    <View style={[styles.pill, error && styles.error]}>
      <View style={styles.status}>
        {loading && !error ? <ActivityIndicator accessibilityLabel={message} size="small" color={color} /> : <>
          <Ionicons accessible={false} name={error ? "warning-outline" : icon} size={18} color={color} />
          <Text accessibilityLiveRegion="polite" accessibilityRole={error ? "alert" : undefined} style={[styles.text, { color, fontSize }]}>{message}</Text>
        </>}
      </View>
      {onRetry ? <Pressable accessibilityRole="button" accessibilityLabel={retryLabel} onPress={onRetry} style={styles.retry}>
        <Text style={[styles.text, { color, fontSize }]}>Retry</Text>
      </Pressable> : null}
    </View>
  );
}
