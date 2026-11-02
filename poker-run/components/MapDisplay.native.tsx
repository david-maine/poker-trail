import { Feather } from "@expo/vector-icons";
import React, { useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import MapView, { Circle, Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";

import { Waypoint } from "../src/types";

type UserLocation = {
  latitude: number;
  longitude: number;
  heading?: number | null;
} | null;

type Props = {
  waypoints: Waypoint[];
  visited: Record<string, boolean>;
  userLocation: UserLocation;
};

const mapInsets = { bottom: 290, left: 16, right: 16, top: 112 };

export default function MapDisplay({ waypoints, visited, userLocation }: Props) {
  const mapRef = useRef<MapView | null>(null);
  const initialRegion: Region = userLocation
    ? {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.00922,
        longitudeDelta: 0.00421,
      }
    : {
        latitude: waypoints[0]?.latitude ?? 0,
        longitude: waypoints[0]?.longitude ?? 0,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };

  function handleRecenter() {
    if (!userLocation) {
      return;
    }

    mapRef.current?.animateToRegion(
      {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.00922,
        longitudeDelta: 0.00421,
      },
      350
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        followsUserLocation={false}
        initialRegion={initialRegion}
        legalLabelInsets={mapInsets}
        mapPadding={mapInsets}
        provider={PROVIDER_GOOGLE}
        ref={mapRef}
        showsMyLocationButton={false}
        showsUserLocation={true}
        style={styles.map}
      >
        {waypoints.map((waypoint) => (
          <Circle
            center={{ latitude: waypoint.latitude, longitude: waypoint.longitude }}
            fillColor={
              visited[waypoint.id] ? "rgba(34,139,34,0.18)" : "rgba(220,20,60,0.12)"
            }
            key={`circle-${waypoint.id}`}
            radius={waypoint.radiusMeters ?? 20}
            strokeColor={
              visited[waypoint.id] ? "rgba(34,139,34,0.7)" : "rgba(220,20,60,0.7)"
            }
            strokeWidth={2}
          />
        ))}

        {waypoints.map((waypoint) => (
          <Marker
            coordinate={{ latitude: waypoint.latitude, longitude: waypoint.longitude }}
            key={waypoint.id}
            pinColor={visited[waypoint.id] ? "green" : "red"}
            title={waypoint.name}
          />
        ))}
      </MapView>

      <Pressable
        accessibilityLabel="Recenter map on your location"
        disabled={!userLocation}
        onPress={handleRecenter}
        style={({ pressed }) => [
          styles.recenterButton,
          pressed ? styles.recenterButtonPressed : null,
          !userLocation ? styles.recenterButtonDisabled : null,
        ]}
      >
        <Feather name="crosshair" size={22} color="#1f2937" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: "100%",
    position: "relative",
    width: "100%",
  },
  map: {
    height: "100%",
    width: "100%",
  },
  recenterButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    elevation: 4,
    height: 48,
    justifyContent: "center",
    left: 16,
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    top: 56,
    width: 48,
    zIndex: 3,
  },
  recenterButtonDisabled: {
    opacity: 0.45,
  },
  recenterButtonPressed: {
    opacity: 0.78,
  },
});
