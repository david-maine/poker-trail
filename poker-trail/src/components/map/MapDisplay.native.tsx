import React, { useRef } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import MapView, { Circle, Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";

import { Waypoint } from "../../types";
import type { MapControlLayout } from "../../lib/responsiveLayout";

type UserLocation = {
  latitude: number;
  longitude: number;
  heading?: number | null;
} | null;

type Props = {
  waypoints: Waypoint[];
  visited: Record<string, boolean>;
  userLocation: UserLocation;
  controls?: MapControlLayout;
};

export default function MapDisplay({ waypoints, visited, userLocation, controls = { top: 56, left: 16, size: 48 } }: Props) {
  const mapInsets = { bottom: 16, left: 16, right: 16, top: controls.top + controls.size + 12 };
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
          { top: controls.top, left: controls.left, width: controls.size, height: controls.size, borderRadius: controls.size / 2 },
          pressed ? styles.recenterButtonPressed : null,
          !userLocation ? styles.recenterButtonDisabled : null,
        ]}
      >
        <Image accessible={false} source={require("../../../assets/images/POKER-TRAIL-icon-location.png")} resizeMode="contain" style={styles.controlIcon} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  controlIcon: { width: "100%", height: "100%" },
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
