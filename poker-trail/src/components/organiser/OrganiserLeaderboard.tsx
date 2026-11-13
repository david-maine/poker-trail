import { TEXT_STYLE, textMetrics, getLeaderboardTypography, FONT_SIZE, FONT_WEIGHT } from "../../lib/typography";
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import CardRow from '../cards/CardRow';
import { loadOrganiserLeaderboard } from '../../lib/organiser';
import type { OrganiserLeaderboardEntry } from '../../lib/organiser';
import { COLORS, TRAIL_INK } from "../../lib/theme";
import { LANDING_INPUT_FONT } from '../../lib/landingTypography';
import { RobotoSlab_700Bold } from '@expo-google-fonts/roboto-slab/700Bold';
import { Montserrat_500Medium_Italic } from '@expo-google-fonts/montserrat/500Medium_Italic';
import { useFonts } from 'expo-font';

export default function OrganiserLeaderboard({ eventId }: { eventId: string }) {
  const [fontsLoaded] = useFonts({ RobotoSlab_700Bold, Montserrat_500Medium_Italic });
  const { width, height } = useWindowDimensions();
  const [boardWidth, setBoardWidth] = useState(0);
  const typographyWidth = Math.min(boardWidth || Math.max(1, width - 96), 360);
  const boardTypography = getLeaderboardTypography(typographyWidth, 'organiser');
  const cardHeight = Math.max(42, Math.min(120, height * 0.12));
  const cardGap = Math.max(4, Math.min(12, width * 0.018));
  const [entries, setEntries] = useState<OrganiserLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => setEntries([]), [eventId]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController;
    setError('');
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
  }, [eventId]);

  return <View style={styles.section}>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <View style={styles.boardRegion}>
    <View style={styles.board} onLayout={event => setBoardWidth(event.nativeEvent.layout.width)}>
    {entries.length === 0 && (loading ? <ActivityIndicator accessibilityLabel="Loading leaderboard" size="small" color={COLORS.primary} style={styles.empty} /> : <Text style={[styles.detail, styles.empty]}>{error ? 'We’ll retry automatically.' : 'No players have joined yet.'}</Text>)}
    {entries.map((entry, index) => {
      const cards = entry.best_hand_cards ?? [];
      const slots = cards.map((_, index) => String(index));
      return <View key={entry.run_id} style={styles.player}>
        <View style={styles.entryHeader}>
          <Text style={[styles.rank, fontsLoaded && FONT_WEIGHT.bold, boardTypography.name]}>{entry.leaderboard_rank}.</Text>
          <Text numberOfLines={1} style={[styles.playerName, fontsLoaded && FONT_WEIGHT.bold, boardTypography.name]}>{entry.player_label}</Text>
        </View>
        <View style={styles.cards}><CardRow visitOrder={slots} waypointCards={Object.fromEntries(slots.map((slot, index) => [slot, cards[index]]))} total={5} maxCardHeight={cardHeight} gap={cardGap} /></View>
        <View style={styles.metaRow}><Text style={[styles.handDetail, fontsLoaded && { fontFamily: LANDING_INPUT_FONT }, boardTypography.detail]}>{entry.visit_count === 0 ? 'No cards collected' : entry.best_hand_name || 'No hand yet'}{' · '}{formatDateTime(entry.finished_at || entry.started_at)}</Text></View>
        {index < entries.length - 1 && <View style={styles.entryLine} />}
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
  boardRegion: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 12 },
  board: { width: '100%', minHeight: 48, paddingTop: 12 },
  player: { marginBottom: 16 },
  entryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  empty: { paddingVertical: 8 },
  rank: { color: COLORS.muted, marginRight: 8, minWidth: 24, textAlign: 'center' },
  playerName: { flex: 1, color: TRAIL_INK },
  metaRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-start', paddingVertical: 3 },
  handDetail: { flex: 1, textAlign: 'left', color: COLORS.muted },
  entryLine: { backgroundColor: COLORS.subtleBorder, height: 1, marginTop: 12, width: '100%' },
  detail: { ...TEXT_STYLE.caption, color: COLORS.muted },
  error: { ...FONT_WEIGHT.regular, color: COLORS.error, ...textMetrics(FONT_SIZE.caption) },
  cards: { width: '100%', marginTop: 3, marginBottom: 5 },
});
