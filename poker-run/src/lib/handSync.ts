import { AppState } from "react-native";

import { addConnectivityListener, fetchIsUsableConnection } from "./connectivity";
import { isRetryableHandSubmissionError, loadAcceptedHand, syncHand } from "./game";
import { pendingClaimCount } from "./handSyncState";
import { acknowledgeHand, getLocalHand, recordSyncFailure, subscribeToLocalHandChanges } from "./localHand";
import type { LocalHand } from "./localHand";

// One worker per event session, independent of which screen is mounted.
export function startHandSync(eventId: string, onHand: (hand: LocalHand) => void, onSyncing: (syncing: boolean) => void) {
  let stopped = false;
  let running = false;
  let requested = false;
  let restoreNeeded = true;
  let blocked = false;
  let failures = 0;
  let lastClaims = "";
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule(delay: number) {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => { void work(); }, delay);
  }

  async function work() {
    if (stopped || blocked) return;
    if (running) { requested = true; return; }
    running = true;
    requested = false;
    let retryDelay: number | null = null;
    let restoring = restoreNeeded;
    onSyncing(true);
    try {
      if (!await fetchIsUsableConnection()) throw new Error("Offline. Cards will sync when you reconnect.");
      if (stopped) return;
      if (restoreNeeded) {
        const accepted = await loadAcceptedHand(eventId);
        if (stopped) return;
        await acknowledgeHand(eventId, accepted.claims, accepted.completed, accepted.finishedAt);
        restoreNeeded = false;
        restoring = false;
      }
      const snapshot = await getLocalHand(eventId);
      if (stopped || snapshot.status === "submitted" || pendingClaimCount(snapshot) === 0) return;
      const response = await syncHand(eventId, snapshot.claims);
      // Finish persisting an accepted in-flight upload even if the user left this event.
      await acknowledgeHand(eventId, response.claims, response.run.status === "completed", response.run.finishedAt);
      failures = 0;
    } catch (error) {
      if (stopped) return;
      const message = error instanceof Error ? error.message : "Unable to sync cards.";
      const conflict = message.includes("conflicts with") || message.includes("cannot be changed") || message.includes("another device");
      const retryable = !conflict && (restoring || isRetryableHandSubmissionError(error) || message.startsWith("Offline."));
      blocked = !retryable;
      const rejectedWaypointIds = (error as { rejectedWaypointIds?: string[] } | null)?.rejectedWaypointIds;
      await recordSyncFailure(eventId, message, retryable, rejectedWaypointIds);
      if (retryable) retryDelay = Math.min(60000, 2000 * 2 ** Math.min(failures++, 5));
    } finally {
      running = false;
      if (!stopped) {
        onSyncing(false);
        if (retryDelay !== null) schedule(retryDelay);
        else if (requested && !blocked) schedule(0);
      }
    }
  }

  const unsubscribe = subscribeToLocalHandChanges(hand => {
    if (hand.eventId !== eventId || stopped) return;
    onHand(hand);
    const fingerprint = JSON.stringify(hand.claims);
    if (fingerprint !== lastClaims) {
      lastClaims = fingerprint;
      if (!hand.lastSubmissionError) blocked = false;
      if (!blocked && pendingClaimCount(hand) > 0) { requested = true; schedule(0); }
    }
  });
  const unsubscribeConnectivity = addConnectivityListener(usable => {
    if (usable && !blocked) { restoreNeeded = true; schedule(0); }
  });
  const appState = AppState.addEventListener("change", state => {
    if (state === "active" && !blocked) { restoreNeeded = true; schedule(0); }
  });
  void getLocalHand(eventId).then(hand => {
    if (stopped) return;
    lastClaims = JSON.stringify(hand.claims);
    onHand(hand);
    schedule(0);
  }).catch(() => { if (!stopped) schedule(0); });

  return {
    retry() { blocked = false; failures = 0; restoreNeeded = true; schedule(0); },
    stop() { stopped = true; clearTimeout(timer); unsubscribe(); unsubscribeConnectivity(); appState.remove(); },
  };
}
