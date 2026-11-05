import { Pressable, StyleSheet, Text, View } from "react-native";

import { useEventSession } from "../lib/eventSession";
import { pendingClaimCount } from "../lib/handSyncState";

export default function HandSyncStatus({ color = "#202542", fontSize = 12, hideWhenSaved = false }: { color?: string; fontSize?: number; hideWhenSaved?: boolean }) {
  const { hand, syncingHand, retryHandSync } = useEventSession();
  if (!hand) return null;
  const pending = hand.status === "submitted" ? 0 : pendingClaimCount(hand);
  if (hideWhenSaved && !syncingHand && pending === 0 && !hand.lastSubmissionError) return null;
  const message = hand.lastSubmissionError ?? (syncingHand ? "Syncing cards…" :
    pending > 0 ? `${pending} card${pending === 1 ? "" : "s"} waiting to sync` :
      hand.status === "submitted" ? "Hand complete · Saved" : "All cards saved");
  return (
    <View style={styles.container}>
      <Text accessibilityLiveRegion="polite" style={[styles.text, { color, fontSize }]}>{message}</Text>
      {hand.lastSubmissionError || pending > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Retry card sync" disabled={syncingHand} onPress={retryHandSync} style={[styles.retry, { borderColor: color }]}>
          <Text style={[styles.text, { color, fontSize }]}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", paddingVertical: 6, paddingHorizontal: 12 },
  text: { color: "#202542", fontSize: 12, textAlign: "center" },
  retry: { minHeight: 44, justifyContent: "center", borderWidth: 1, borderColor: "#202542", borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8, marginTop: 4 },
});
