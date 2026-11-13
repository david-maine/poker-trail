import { COLORS, APP_BACKGROUND_COLOR } from "../lib/theme";
import { ActivityIndicator, StyleSheet, View } from "react-native";

type LoadingScreenProps = {
  accessibilityLabel?: string;
};

export default function LoadingScreen({
  accessibilityLabel = "Loading",
}: LoadingScreenProps) {
  return (
    <View style={styles.background}>
      <ActivityIndicator accessibilityLabel={accessibilityLabel} color={COLORS.surface} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: "100%",
    backgroundColor: APP_BACKGROUND_COLOR,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
});
