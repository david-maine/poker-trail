import { TEXT_STYLE } from "../../lib/typography";
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import OrganiserWaypointMap from './OrganiserWaypointMap';
import type { WaypointMapWaypoint } from './OrganiserWaypointMap';
import type { WaypointDraft } from '../../lib/organiserWaypointDraft';
import { COLORS, TRAIL_WHITE } from "../../lib/theme";

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
  const [mapWidth, setMapWidth] = useState(0);
  const latitude = Number(draft.latitude), longitude = Number(draft.longitude), radiusMeters = Number(draft.radius);
  const validPoint = !!draft.latitude.trim() && !!draft.longitude.trim() && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  return <View style={styles.editor}>
      <View style={[styles.selector, { width: mapWidth || '100%' }]}>
        <View accessibilityRole="tablist" accessibilityLabel="Waypoints" style={styles.tabs}>{[0, 1, 2, 3, 4].map(index => {
          const selected = selectedSlotIndex === index;
          const isSet = waypoints.some(point => point.sortOrder === index);
          return <Pressable key={index} accessibilityRole="tab" accessibilityLabel={`Waypoint ${index + 1}${isSet ? ', set' : ''}`} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => { if (!disabled && !selected) onSelect(index); }} style={({ pressed }) => [styles.tab, selected && styles.tabSelected, (pressed || disabled) && styles.dimmed]}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{index + 1}</Text>
          </Pressable>;
        })}</View>
      </View>
    <View style={styles.layout}>
    <View style={styles.mapColumn} onLayout={event => setMapWidth(event.nativeEvent.layout.width)}>
      <OrganiserWaypointMap textStyle={inputTextStyle} autoPickUserLocation={autoPickUserLocation} currentPoint={validPoint ? { latitude, longitude } : null} radiusMeters={Number.isInteger(radiusMeters) && radiusMeters > 0 ? radiusMeters : 20} selectedSlotIndex={selectedSlotIndex} waypoints={waypoints} onPick={point => { if (!disabled) onChange({ ...draft, latitude: String(point.latitude), longitude: String(point.longitude) }); }} />
    </View>
    <View style={styles.fieldsColumn}>
      <View style={styles.coordinateRow}>
        {([['Latitude', 'latitude'], ['Longitude', 'longitude']] as const).map(([label, key]) => <View key={key} style={[styles.field, styles.coordinateField]}>
          <Text style={[labelTextStyle, styles.label]}>{label}</Text>
          <TextInput accessibilityLabel={label} value={draft[key]} onChangeText={value => onChange({ ...draft, [key]: value })} editable={!disabled} autoCapitalize="none" inputMode="decimal" style={[styles.input, inputTextStyle]} />
        </View>)}
      </View>
      <View style={styles.field}>
        <Text style={[labelTextStyle, styles.label]}>Check-in radius</Text>
        <View style={styles.radiusControl}>
          <TextInput accessibilityLabel="Check-in radius (m)" accessibilityHint="Players must be within this distance to collect." value={draft.radius} onChangeText={radius => onChange({ ...draft, radius })} editable={!disabled} autoCapitalize="none" inputMode="numeric" style={[styles.radiusInput, inputTextStyle]} />
          <Text accessible={false} style={styles.radiusUnit}>m</Text>
        </View>
        <Text style={styles.helper}>Players must be within this distance to collect.</Text>
      </View>
      {children}
    </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  editor: { gap: 0 },
  layout: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 24 },
  mapColumn: { flexBasis: 480, flexGrow: 1, flexShrink: 1, minWidth: 0 },
  fieldsColumn: { flexBasis: 280, flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 16 },
  coordinateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  coordinateField: { flexBasis: 120, flexGrow: 1, flexShrink: 1 },
  selector: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  tabs: { flexDirection: 'row', width: '100%', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab: { flex: 1, minWidth: 0, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabSelected: { backgroundColor: COLORS.selected, borderBottomColor: COLORS.primary },
  tabLabel: { ...TEXT_STYLE.button, color: COLORS.muted, textAlign: 'center' },
  tabLabelSelected: { color: COLORS.primary },
  dimmed: { opacity: 0.45 },
  field: { gap: 4, minWidth: 0 },
  label: { ...TEXT_STYLE.caption, color: COLORS.muted },
  input: { ...TEXT_STYLE.body, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 10, color: COLORS.text, backgroundColor: TRAIL_WHITE, minHeight: 44 },
  radiusControl: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, backgroundColor: TRAIL_WHITE, minHeight: 44 },
  radiusInput: { ...TEXT_STYLE.body, flex: 1, minWidth: 0, padding: 10, color: COLORS.text },
  radiusUnit: { ...TEXT_STYLE.caption, color: COLORS.muted, paddingRight: 12 },
  helper: { ...TEXT_STYLE.caption, color: COLORS.muted },
});
