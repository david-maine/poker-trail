import { CARD_BACK_IMAGE } from "../../src/lib/cardImages";
import { APP_BACKGROUND_COLOR, TRAIL_INK, TRAIL_WHITE, TRAIL_DISPLAY_FONT, TRAIL_BODY_FONT } from "../../src/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { AppState, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import LeaveEventButton from "../../src/components/LeaveEventButton";
import useResponsiveLayout from "../../src/hooks/useResponsiveLayout";
import { getCardRowLayout } from "../../src/lib/responsiveLayout";
import LoadingStatus from "../../src/components/LoadingStatus";
import CardImage, { preloadCardImages } from "../../src/components/CardImage";
import PlayingCard from "../../src/components/PlayingCard";
import { useEventSession } from "../../src/lib/eventSession";
import {
  LeaderboardEntry,
  loadLeaderboardSnapshotForEvent,
} from "../../src/lib/game";
import { addConnectivityListener } from "../../src/lib/connectivity";
import { supabase } from "../../src/lib/supabase";
import HandSyncStatus from "../../src/components/HandSyncStatus";

export default function LeaderboardScreen() {
  const layout = useResponsiveLayout(false);
  // Preserve narrow-screen typography and cap wide-screen text at half its original maximum.
  const typographyWidth = Math.min(layout.contentWidth, layout.contentMaxWidth / 2);
  const playerNameSize = 75 * typographyWidth / 1241;
  const entryDetailSize = 50 * typographyWidth / 1241;
  const cards = getCardRowLayout(Math.min(layout.contentWidth, layout.contentMaxWidth), 5, layout.cardHeight, layout.cardGap);
  const { registrationState } = useEventSession();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());
  const refreshQueued = useRef(new Set<string>());
  const event = registrationState.event;
  const eventId = event?.id ?? "";
  const activeEvent = useRef(eventId);

  useEffect(() => { void preloadCardImages(); }, []);

  useEffect(() => {
    activeEvent.current = eventId;
    setEntries([]);
    setCurrentUserId(null);
    setErrorMessage(null);
    setLoading(true);
    return () => { activeEvent.current = ""; };
  }, [eventId]);

  const refreshLeaderboard = useCallback(async function refreshEntries(showSpinner: boolean) {
    if (!event) return;
    if (inFlight.current.has(event.id)) { refreshQueued.current.add(event.id); return; }
    const id = event.id;
    inFlight.current.add(id);
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    try {
      const snapshot = await loadLeaderboardSnapshotForEvent(event);
      if (activeEvent.current !== id) return;
      setEntries(snapshot.entries);
      setCurrentUserId(snapshot.currentUserId);
      setErrorMessage(null);
    } catch (error) {
      if (activeEvent.current === id) setErrorMessage(getErrorMessage(error, "Unable to load the leaderboard."));
    } finally {
      inFlight.current.delete(id);
      if (activeEvent.current === id) {
        setLoading(false); setRefreshing(false);
        if (refreshQueued.current.delete(id)) void refreshEntries(false);
      }
    }
  }, [event]);

  useFocusEffect(useCallback(() => {
    if (!eventId) return;
    void refreshLeaderboard(false);
    let debounce: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => { void refreshLeaderboard(false); }, 150);
    };
    const channel = supabase.channel("leaderboard:" + eventId)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_leaderboard_updates", filter: "event_id=eq." + eventId }, refresh)
      .subscribe(status => { if (status === "SUBSCRIBED") refresh(); });
    const interval = setInterval(refresh, 10000);
    const disconnect = addConnectivityListener(online => { if (online) refresh(); });
    const appState = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    return () => {
      clearTimeout(debounce);
      clearInterval(interval);
      disconnect();
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [eventId, refreshLeaderboard]));

  const visibleEntries = entries;
  const visibleCurrentUserId = currentUserId;

  if (!event && visibleEntries.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {errorMessage ?? "No active event is available for the leaderboard."}
        </Text>
        <Pressable
          onPress={() => {
            void refreshLeaderboard(false);
          }}
          style={styles.refreshButton}
        >
          <Text style={styles.refreshButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View onLayout={layout.onLayout} style={styles.container}>
      <LeaveEventButton style={[styles.leaveButton, { top: layout.controlTop, right: layout.right, width: layout.controlSize, height: layout.controlSize, borderRadius: layout.controlSize / 2 }]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={refreshing ? "Refreshing leaderboard" : "Refresh leaderboard"}
        accessibilityState={{ busy: refreshing, disabled: refreshing }}
        disabled={refreshing}
        onPress={() => { void refreshLeaderboard(false); }}
        style={({ pressed }) => [styles.floatingRefresh, {
          top: layout.controlTop, left: layout.left, width: layout.controlSize,
          height: layout.controlSize, borderRadius: layout.controlSize / 2,
        }, (pressed || refreshing) && styles.refreshDimmed]}
      >
        <Ionicons name="refresh" size={layout.controlSize * 0.6} color={APP_BACKGROUND_COLOR} />
      </Pressable>
      <View style={[styles.trophyHeader, { paddingTop: layout.controlTop, paddingBottom: layout.gap, paddingLeft: layout.left, paddingRight: layout.right }]}>
        <Image accessible={false} source={require("../../assets/images/POKER-TRAIL-trophy.png")} resizeMode="contain"
          style={{ width: Math.min(160, Math.max(72, layout.height * 0.18)) * 392 / 454, height: Math.min(160, Math.max(72, layout.height * 0.18)) }} />
        <HandSyncStatus fontSize={layout.detailSize} />
      </View>
      <View style={[styles.background, { paddingLeft: layout.left, paddingRight: layout.right }]}>
        <View style={styles.boardContent}>

          {loading && visibleEntries.length === 0 ? (
            <LoadingStatus label="Loading leaderboard" color={TRAIL_INK} spinnerOnly />
          ) : visibleEntries.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>{errorMessage ? "Unable to load the leaderboard" : "No players have joined yet"}</Text>
              <Text style={styles.emptyText}>
                {errorMessage ? "Check your connection and try Refresh." : "Players appear here as soon as they join this event."}
              </Text>
            </View>
          ) : (
            <FlatList
              data={visibleEntries}
              keyExtractor={entry => entry.runId}
              extraData={visibleCurrentUserId}
              initialNumToRender={4}
              maxToRenderPerBatch={4}
              windowSize={5}
              contentContainerStyle={[styles.listContent, { paddingTop: layout.gap }]}
              style={styles.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => <LeaderboardRow key={item.runId} entry={item}
                currentUserId={visibleCurrentUserId} cards={cards}
                playerNameSize={playerNameSize} entryDetailSize={entryDetailSize} />}
            />
          )}

          {errorMessage ? (
            <ScrollView style={{ flexGrow: 0, maxHeight: layout.footerMaxHeight }} contentContainerStyle={styles.footer}>
              <Text style={styles.errorTextSmall}>{errorMessage}</Text>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </View>
  );
}

type RowProps = {
  entry: LeaderboardEntry;
  currentUserId: string | null;
  cards: ReturnType<typeof getCardRowLayout>;
  playerNameSize: number;
  entryDetailSize: number;
};
const LeaderboardRow = memo(function LeaderboardRow({ entry, currentUserId, cards, playerNameSize, entryDetailSize }: RowProps) {
                const isCurrentUser = currentUserId === entry.userId;
                const timeLabel = entry.finishedAt
                  ? formatDateTime(entry.finishedAt)
                  : formatDateTime(entry.startedAt);

                return (
                  <View key={entry.runId} style={styles.entry}>
                    <View style={styles.entryHeader}>
                      <Text style={[styles.rankText, { fontSize: playerNameSize, lineHeight: playerNameSize * 1.4 }]}>{entry.leaderboardRank}.</Text>
                      <Text numberOfLines={1} style={[styles.playerName, { fontSize: playerNameSize, lineHeight: playerNameSize * 1.4 }]}>
                        {entry.playerLabel}
                        {isCurrentUser ? " (You)" : ""}
                      </Text>
                    </View>

                    <View style={[styles.cardsRow, { gap: cards.gap }]}>
                      {Array.from({ length: 5 }).map((_, index) => {
                        const card = entry.bestHandCards[index];

                        return (
                          <View key={`${entry.runId}-${index}`} style={[styles.cardSlot, { width: cards.width, height: cards.height }]}>
                            {card ? (
                              <PlayingCard
                                card={card}
                                compact
                                style={styles.leaderboardCard}
                              />
                            ) : (
                              <CardImage accessibilityLabel="Empty card slot" source={CARD_BACK_IMAGE} resizeMode="contain" style={styles.cardBack} />
                            )}
                          </View>
                        );
                      })}
                    </View>

                    <View style={styles.metaRow}>
                      <Text style={[styles.handNameText, { fontSize: entryDetailSize, lineHeight: entryDetailSize * 1.4 }]}>
                        {entry.visitCount === 0 ? "No cards collected" : entry.bestHandName}
                        {" · "}
                        {timeLabel}
                      </Text>
                    </View>

                    <View style={styles.entryLine} />
                  </View>
                );

}, (previous, next) =>
  previous.currentUserId === next.currentUserId &&
  previous.playerNameSize === next.playerNameSize && previous.entryDetailSize === next.entryDetailSize &&
  previous.cards.width === next.cards.width && previous.cards.height === next.cards.height && previous.cards.gap === next.cards.gap &&
  previous.entry.runId === next.entry.runId && previous.entry.userId === next.entry.userId &&
  previous.entry.playerLabel === next.entry.playerLabel && previous.entry.leaderboardRank === next.entry.leaderboardRank &&
  previous.entry.startedAt === next.entry.startedAt && previous.entry.finishedAt === next.entry.finishedAt &&
  previous.entry.visitCount === next.entry.visitCount && previous.entry.bestHandName === next.entry.bestHandName &&
  previous.entry.bestHandCards.join(',') === next.entry.bestHandCards.join(',')
);

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return fallback;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TRAIL_WHITE,
  },
  centered: {
    flex: 1,
    backgroundColor: TRAIL_WHITE,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  leaveButton: {
    position: "absolute",
    right: 16,
    top: 56,
    zIndex: 5,
  },
  floatingRefresh: {
    position: "absolute", zIndex: 5,
    backgroundColor: TRAIL_WHITE,
    alignItems: "center", justifyContent: "center",
    elevation: 4, shadowColor: "#000000",
    shadowOffset: { height: 2, width: 0 }, shadowOpacity: 0.2, shadowRadius: 4,
  },
  refreshDimmed: { opacity: 0.5 },
  background: {
    flex: 1,
    backgroundColor: TRAIL_WHITE,
    paddingHorizontal: 28,
  },
  boardContent: { flex: 1, width: "100%", maxWidth: 720, alignSelf: "center", minHeight: 0 },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    paddingBottom: 0,
  },
  trophyHeader: { backgroundColor: APP_BACKGROUND_COLOR, width: "100%", alignItems: "center", gap: 8 },
  headerLine: {
    backgroundColor: "#ffffff",
    height: 2,
    marginBottom: 8,
    width: "100%",
  },
  entry: {
    marginBottom: 6,
  },
  entryHeader: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 3,
  },
  rankText: {
    color: TRAIL_INK,
    fontFamily: "RobotoSlab_800ExtraBold",
    fontSize: 26,
    lineHeight: 38,
    marginRight: 8,
    minWidth: 24,
    textAlign: "center",
  },
  playerName: {
    color: TRAIL_INK,
    flex: 1,
    fontFamily: "RobotoSlab_800ExtraBold",
    fontSize: 26,
    lineHeight: 34,
  },
  cardsRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 5,
    marginTop: 3,
    width: "100%",
  },
  cardSlot: {
    width: 45,
    height: 64,
  },
  leaderboardCard: {
    borderRadius: 8,
    height: "100%",
    width: "100%",
  },
  cardBack: {
    height: "100%",
    width: "100%",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "flex-start",
    paddingVertical: 3,
  },
  handNameText: {
    flex: 1,
    textAlign: "left",
    color: TRAIL_INK,
    fontFamily: "Montserrat_500Medium_Italic",
    fontSize: 11,
    lineHeight: 15,
  },
  entryLine: {
    backgroundColor: TRAIL_INK,
    height: 2,
    marginTop: 14,
    width: "100%",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: TRAIL_INK,
    fontFamily: TRAIL_BODY_FONT,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyText: {
    color: TRAIL_INK,
    fontFamily: TRAIL_BODY_FONT,
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
  },
  errorText: {
    color: TRAIL_INK,
    fontSize: 16,
    textAlign: "center",
  },
  errorTextSmall: {
    color: TRAIL_INK,
    fontFamily: TRAIL_BODY_FONT,
    fontSize: 13,
    marginBottom: 8,
    textAlign: "center",
  },
  footer: {
    alignItems: "center",
    paddingTop: 8,
  },
  refreshButton: {
    backgroundColor: TRAIL_WHITE,
    borderColor: TRAIL_INK,
    borderRadius: 12,
    borderWidth: 3,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: "center",
    paddingVertical: 10,
  },
  lockedButton: {
    backgroundColor: APP_BACKGROUND_COLOR,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
  },
  refreshButtonText: {
    color: TRAIL_INK,
    fontFamily: TRAIL_DISPLAY_FONT,
    fontWeight: "900",
  },
});
