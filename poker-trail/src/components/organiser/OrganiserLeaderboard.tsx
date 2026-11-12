import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import CardRow from '../cards/CardRow';
import { loadOrganiserLeaderboard } from '../../lib/organiser';
import type { OrganiserLeaderboardEntry } from '../../lib/organiser';
import { TRAIL_INK } from '../../lib/theme';
import { LANDING_BUTTON_FONT, LANDING_INPUT_FONT, getOrganiserDetailSize } from '../../lib/landingTypography';
import { RobotoSlab_800ExtraBold } from '@expo-google-fonts/roboto-slab/800ExtraBold';
import { Montserrat_500Medium_Italic } from '@expo-google-fonts/montserrat/500Medium_Italic';
import { useFonts } from 'expo-font';

export default function OrganiserLeaderboard({ eventId }: { eventId: string }) {
  const [fontsLoaded] = useFonts({ RobotoSlab_800ExtraBold, Montserrat_500Medium_Italic });
  const { width, height } = useWindowDimensions();
  const [boardWidth, setBoardWidth] = useState(0);
  const typographyWidth = Math.min(boardWidth || Math.max(1, width - 96), 360);
  const playerNameSize = 60 * typographyWidth / 1241;
  const entryDetailSize = getOrganiserDetailSize(typographyWidth);
  const cardHeight = Math.max(42, Math.min(120, height * 0.12));
  const cardGap = Math.max(4, Math.min(12, width * 0.018));
  const [entries, setEntries] = useState<OrganiserLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController;
    setEntries([]); setError('');
    async function refresh() {
      request = new AbortController();
      const timeout = setTimeout(() => request.abort(), 15000);
      setLoading(true);
      try {
        const data = await loadOrganiserLeaderboard(eventId, request.signal);
        if (alive) { setEntries(data); setError(''); }
      } catch {
        if (alive) setError('Unable to refresh the leaderboard. Please try again.');
      } finally {
        clearTimeout(timeout);
        if (alive) { setLoading(false); timer = setTimeout(() => void refresh(), 10000); }
      }
    }
    void refresh();
    return () => { alive = false; clearTimeout(timer); request?.abort(); };
  }, [eventId, revision]);

  return <View style={styles.section}>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <View style={styles.boardRegion}>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh leaderboard" accessibilityState={{ busy: loading, disabled: loading }} disabled={loading} onPress={() => setRevision(value => value + 1)} style={({ pressed }) => [styles.refresh, (pressed || loading) && { opacity: 0.5 }]}>
        <Feather name="refresh-cw" size={22} color="#000000" accessible={false} />
      </Pressable>
    <View style={styles.board} onLayout={event => setBoardWidth(event.nativeEvent.layout.width)}>
    {entries.length === 0 && <Text style={[styles.detail, styles.empty]}>{loading ? 'Loading leaderboard…' : error ? 'Use Refresh to try again.' : 'No players have joined yet.'}</Text>}
    {entries.map((entry, index) => {
      const cards = entry.best_hand_cards ?? [];
      const slots = cards.map((_, index) => String(index));
      return <View key={entry.run_id} style={styles.player}>
        <View style={[styles.entryHeader, index === 0 && styles.firstEntryHeader]}>
          <Text style={[styles.rank, fontsLoaded && { fontFamily: LANDING_BUTTON_FONT }, { fontSize: playerNameSize, lineHeight: playerNameSize * 1.4 }]}>{entry.leaderboard_rank}.</Text>
          <Text numberOfLines={1} style={[styles.playerName, fontsLoaded && { fontFamily: LANDING_BUTTON_FONT }, { fontSize: playerNameSize, lineHeight: playerNameSize * 1.4 }]}>{entry.player_label}</Text>
        </View>
        <View style={styles.cards}><CardRow visitOrder={slots} waypointCards={Object.fromEntries(slots.map((slot, index) => [slot, cards[index]]))} total={5} maxCardHeight={cardHeight} gap={cardGap} /></View>
        <View style={styles.metaRow}><Text style={[styles.handDetail, fontsLoaded && { fontFamily: LANDING_INPUT_FONT }, { fontSize: entryDetailSize, lineHeight: entryDetailSize * 1.4 }]}>{entry.visit_count === 0 ? 'No cards collected' : entry.best_hand_name || 'No hand yet'}{' · '}{formatDateTime(entry.finished_at || entry.started_at)}</Text></View>
        <View style={styles.entryLine} />
      </View>;
    })}
    </View>
    </View>
  </View>;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
}

const styles = StyleSheet.create({
  section: { gap: 16 },
  boardRegion: { position: 'relative', width: '100%' },
  refresh: { position: 'absolute', top: 0, right: 0, zIndex: 1, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  board: { position: 'relative', width: '100%', maxWidth: 720, alignSelf: 'center', minHeight: 48 },
  player: { marginBottom: 6 },
  entryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  firstEntryHeader: { minHeight: 48, paddingRight: 56 },
  empty: { paddingRight: 56, paddingTop: 14 },
  rank: { color: TRAIL_INK, marginRight: 8, minWidth: 24, textAlign: 'center' },
  playerName: { flex: 1, color: TRAIL_INK },
  metaRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-start', paddingVertical: 3 },
  handDetail: { flex: 1, textAlign: 'left', color: TRAIL_INK },
  entryLine: { backgroundColor: TRAIL_INK, height: 2, marginTop: 14, width: '100%' },
  detail: { color: '#4c5c50', fontSize: 12, lineHeight: 18.4 },
  error: { color: '#8a4520', fontSize: 12 },
  cards: { width: '100%', marginTop: 3, marginBottom: 5 },
});
