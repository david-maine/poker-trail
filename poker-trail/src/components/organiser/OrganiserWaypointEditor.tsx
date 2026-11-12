import type { ReactNode } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useFonts } from 'expo-font';
import { RobotoSlab_800ExtraBold } from '@expo-google-fonts/roboto-slab/800ExtraBold';
import { Montserrat_500Medium_Italic } from '@expo-google-fonts/montserrat/500Medium_Italic';
import OrganiserWaypointMap from './OrganiserWaypointMap';
import type { WaypointMapWaypoint } from './OrganiserWaypointMap';
import type { WaypointDraft } from '../../lib/organiserWaypointDraft';
import { APP_BACKGROUND_COLOR, TRAIL_INK, TRAIL_WHITE } from '../../lib/theme';
import { LANDING_BUTTON_FONT, LANDING_INPUT_FONT, getOrganiserHeadingSize, getOrganiserDetailSize } from '../../lib/landingTypography';

type Props = {
  inputTextStyle?: StyleProp<TextStyle>;
  labelTextStyle?: StyleProp<TextStyle>;
  draft: WaypointDraft;
  selectedSlotIndex: number;
  waypoints: WaypointMapWaypoint[];
  disabled?: boolean;
  autoPickUserLocation?: boolean;
  onChange: (draft: WaypointDraft) => void;
  onSelect: (index: number) => void;
  children?: ReactNode;
};

export default function OrganiserWaypointEditor({ inputTextStyle, labelTextStyle, draft, selectedSlotIndex, waypoints, disabled = false, autoPickUserLocation = true, onChange, onSelect, children }: Props) {
  const [fontsLoaded] = useFonts({ RobotoSlab_800ExtraBold, Montserrat_500Medium_Italic });
  const { width } = useWindowDimensions();
  const fontSize = getOrganiserHeadingSize(width);
  const detailSize = getOrganiserDetailSize(Math.max(1, width - 100));
  const latitude = Number(draft.latitude), longitude = Number(draft.longitude), radiusMeters = Number(draft.radius);
  const validPoint = !!draft.latitude.trim() && !!draft.longitude.trim() && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  return <View style={styles.layout}>
    <View style={styles.mapColumn}>
      <OrganiserWaypointMap textStyle={inputTextStyle} autoPickUserLocation={autoPickUserLocation} currentPoint={validPoint ? { latitude, longitude } : null} radiusMeters={Number.isInteger(radiusMeters) && radiusMeters > 0 ? radiusMeters : 20} selectedSlotIndex={selectedSlotIndex} waypoints={waypoints} onPick={point => { if (!disabled) onChange({ ...draft, latitude: String(point.latitude), longitude: String(point.longitude) }); }} />
      <View accessibilityRole="tablist" accessibilityLabel="Waypoints" style={styles.tabs}>{[0, 1, 2, 3, 4].map(index => {
        const selected = selectedSlotIndex === index;
        return <Pressable key={index} accessibilityRole="tab" accessibilityLabel={`Waypoint ${index + 1}${waypoints.some(point => point.sortOrder === index) ? ', set' : ''}`} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => { if (!selected) onSelect(index); }} style={({ pressed }) => [styles.tab, { backgroundColor: selected ? APP_BACKGROUND_COLOR : TRAIL_WHITE }, (pressed || disabled) && styles.dimmed]}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.tabLabel, { fontSize, color: selected ? TRAIL_WHITE : TRAIL_INK }, fontsLoaded && { fontFamily: LANDING_BUTTON_FONT }]}>{index + 1}</Text>
        </Pressable>;
      })}</View>
    </View>
    <View style={styles.fieldsColumn}>
      {([['Latitude', 'latitude'], ['Longitude', 'longitude'], ['Radius (m)', 'radius']] as const).map(([label, key]) => <View key={key} style={styles.field}>
        <Text style={[styles.label, { fontSize: detailSize, lineHeight: detailSize * 1.4 }, fontsLoaded && { fontFamily: LANDING_INPUT_FONT }, labelTextStyle]}>{label}</Text>
        <TextInput accessibilityLabel={label} value={draft[key]} onChangeText={value => onChange({ ...draft, [key]: value })} editable={!disabled} autoCapitalize="none" inputMode="decimal" style={[styles.input, inputTextStyle]} />
      </View>)}
      {children}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  layout: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 24 },
  mapColumn: { position: 'relative', flexBasis: 480, flexGrow: 1, flexShrink: 1, minWidth: 0 },
  fieldsColumn: { flexBasis: 280, flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 16 },
  tabs: { position: 'absolute', top: 10, right: 10, zIndex: 2 },
  tab: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: 8, borderWidth: 1, borderColor: APP_BACKGROUND_COLOR },
  tabLabel: { textAlign: 'center' },
  dimmed: { opacity: 0.45 },
  field: { gap: 4, maxWidth: 560, width: '100%' },
  label: { color: TRAIL_INK, fontWeight: '400' },
  input: { borderWidth: 1, borderColor: '#a2b6a5', borderRadius: 8, padding: 12, color: '#153c2a', fontSize: 12.8, backgroundColor: TRAIL_WHITE, minHeight: 48 },
});
