import { APP_BACKGROUND_COLOR } from "../lib/theme";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

type LoadingScreenProps = {
  accessibilityLabel?: string;
  spinnerOnly?: boolean;
};

export default function LoadingScreen({
  accessibilityLabel = "Loading",
  spinnerOnly = false,
}: LoadingScreenProps) {
  return (
    <View style={styles.background}>
      {spinnerOnly ? <ActivityIndicator accessibilityLabel={accessibilityLabel} color="#ffffff" size="large" /> : <Text accessibilityLiveRegion="polite" style={styles.message}>
        {accessibilityLabel}…
      </Text>}
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
  message: {
    color: "#ffffff",
    fontSize: 16,
    textAlign: "center",
  },
});
