import { StyleSheet, Text, View } from "react-native";

import type { OrganiserWaypoint } from "../lib/organiser";

export type WaypointMapPoint = {
  latitude: number;
  longitude: number;
};

export type WaypointMapWaypoint = Pick<OrganiserWaypoint, 'latitude' | 'longitude' | 'radiusMeters' | 'sortOrder' | 'name'>;

type Props = {
  currentPoint: WaypointMapPoint | null;
  radiusMeters: number;
  selectedSlotIndex: number;
  waypoints: WaypointMapWaypoint[];
  onPick: (point: WaypointMapPoint) => void;
  autoPickUserLocation?: boolean;
};

export default function OrganiserWaypointMap(_props: Props) {
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Map picker is available on web</Text>
      <Text style={styles.text}>
        Open the organiser page in a browser to set waypoint positions on a map.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: "#faf9f7",
    borderColor: "#e6e1d8",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 320,
    padding: 16,
  },
  title: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "900",
  },
  text: {
    color: "#4b5563",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
});
