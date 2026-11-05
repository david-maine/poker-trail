import { statusPillStyles as styles } from "./statusPillStyles";
import { Ionicons } from "@expo/vector-icons";
import { Alert, Platform, Pressable, Text, View } from "react-native";

import { useEventSession } from "../lib/eventSession";

export default function HandSyncStatus({ fontSize = 13 }: { fontSize?: number }) {
  const { hand, syncingHand, retryHandSync } = useEventSession();
  const error = hand?.lastSubmissionError;
  if (!error || syncingHand) return null;
  const color = "#b42318";

  function showDetails() {
    if (!error) return;
    if (Platform.OS === "web") globalThis.alert(error);
    else Alert.alert("Card sync issue", error, [{ text: "OK" }]);
  }

  const label = (
    <>
      <Ionicons accessible={false} name="warning-outline" size={18} color={color} />
      <Text accessibilityLiveRegion="polite" style={[styles.text, { color, fontSize }]}>Cards failed to sync</Text>
    </>
  );

  return (
    <View style={[styles.pill, styles.error]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cards failed to sync. Show details" onPress={showDetails} style={styles.status}>
        {label}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Retry card sync" onPress={retryHandSync} style={styles.retry}>
        <Text style={[styles.text, { color, fontSize }]}>Retry</Text>
      </Pressable>
    </View>
  );
}
