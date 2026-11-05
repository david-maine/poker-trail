import { APP_BACKGROUND_COLOR } from "../lib/theme";
import { StyleSheet, Text, View } from "react-native";

type LoadingScreenProps = {
  accessibilityLabel?: string;
};

export default function LoadingScreen({
  accessibilityLabel = "Loading",
}: LoadingScreenProps) {
  return (
    <View style={styles.background}>
      <Text accessibilityLiveRegion="polite" style={styles.message}>
        {accessibilityLabel}…
      </Text>
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
