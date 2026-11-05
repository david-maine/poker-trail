import { statusPillStyles as styles } from "./statusPillStyles";
import { Ionicons } from "@expo/vector-icons";
import { Alert, Platform, Pressable, Text, View } from "react-native";

import useConnectionStatus from "../hooks/useConnectionStatus";
import { useEventSession } from "../lib/eventSession";
import { pendingClaimCount } from "../lib/handSyncState";
import { APP_BACKGROUND_COLOR } from "../lib/theme";

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
