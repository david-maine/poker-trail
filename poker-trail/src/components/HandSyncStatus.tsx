import { Ionicons } from "@expo/vector-icons";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import useConnectionStatus from "../hooks/useConnectionStatus";
import { useEventSession } from "../lib/eventSession";
import { pendingClaimCount } from "../lib/handSyncState";
import { APP_BACKGROUND_COLOR, TRAIL_WHITE } from "../lib/theme";

export default function HandSyncStatus({ fontSize = 13 }: { fontSize?: number }) {
  const { hand, syncingHand, retryHandSync } = useEventSession();
  const online = useConnectionStatus();
  if (!hand) return null;
  const pending = hand.status === "submitted" ? 0 : pendingClaimCount(hand);
  const error = hand.lastSubmissionError;
  if (!syncingHand && pending === 0 && !error) return null;

  const offline = online === false;
  const showError = !syncingHand && !offline && Boolean(error);
  const color = showError ? "#b42318" : offline ? "#704800" : APP_BACKGROUND_COLOR;
  const icon = showError ? "warning-outline" : offline ? "cloud-offline-outline" : "cloud-upload-outline";
  const pendingText = `${pending} card${pending === 1 ? "" : "s"}`;
  const message = offline ? (pending > 0 ? `Offline · ${pendingText} pending` : "Offline · Sync paused") :
    syncingHand ? "Syncing cards" : showError ? "Sync issue" : `${pendingText} waiting to sync`;

  function showDetails() {
    if (!error) return;
    if (Platform.OS === "web") globalThis.alert(error);
    else Alert.alert("Card sync issue", error, [{ text: "OK" }]);
  }

  const label = (
    <>
      <Ionicons accessible={false} name={icon} size={18} color={color} />
      <Text accessibilityLiveRegion="polite" style={[styles.text, { color, fontSize }]}>{message}</Text>
    </>
  );

  return (
    <View style={[styles.pill, showError && styles.error, offline && styles.offline]}>
      {showError ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Sync issue. Show details" onPress={showDetails} style={styles.status}>
          {label}
        </Pressable>
      ) : <View style={styles.status}>{label}</View>}
      {!offline && (pending > 0 || error) ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Retry card sync"
          accessibilityState={{ disabled: syncingHand }} disabled={syncingHand}
          onPress={syncingHand ? undefined : retryHandSync}
          style={[styles.retry, syncingHand && styles.disabled]}>
          <Text style={[styles.text, { color, fontSize }]}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row", alignItems: "center", alignSelf: "center", maxWidth: "100%",
    backgroundColor: TRAIL_WHITE, borderRadius: 28, borderWidth: 1, borderColor: "#d7e3d9",
    paddingHorizontal: 6, elevation: 4, shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 4,
  },
  error: { backgroundColor: "#fff3f0", borderColor: "#edb4aa" },
  offline: { backgroundColor: "#fff7df", borderColor: "#e6ce92" },
  status: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 6, paddingVertical: 6, minHeight: 44, flexShrink: 1 },
  text: { fontWeight: "600", flexShrink: 1 },
  retry: { minHeight: 44, justifyContent: "center", paddingHorizontal: 10, paddingVertical: 6, borderLeftWidth: 1, borderLeftColor: "#d7d7d7" },
  disabled: { opacity: 0.4 },
});
