import { COLORS } from "../../lib/theme";
import { TEXT_STYLE, FONT_SIZE, FONT_WEIGHT, textMetrics } from "../../lib/typography";
import type { StyleProp, TextStyle } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import type { WaypointMapPoint, WaypointMapWaypoint } from "./OrganiserWaypointMap";

import { loadGoogleMaps, mapsApiKey } from "../../lib/googleMaps.web";
import type { GoogleMapsApi, GoogleCircle, GoogleMap, GoogleMarker, GoogleWindow, GoogleLatLng, GooglePoint } from "../../lib/googleMaps.web";

type Props = {
  textStyle?: StyleProp<TextStyle>;
  currentPoint: WaypointMapPoint | null;
  radiusMeters: number;
  selectedSlotIndex: number;
  waypoints: WaypointMapWaypoint[];
  onPick: (point: WaypointMapPoint) => void;
  autoPickUserLocation?: boolean;
};

export default function OrganiserWaypointMap({
  textStyle,
  currentPoint,
  radiusMeters,
  selectedSlotIndex,
  waypoints,
  onPick,
  autoPickUserLocation = true,
}: Props) {
  const [containerNode, setContainerNode] = useState<HTMLElement | null>(null);
  const [map, setMap] = useState<GoogleMap | null>(null);
  const [mapsApi, setMapsApi] = useState<GoogleMapsApi | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [userPoint, setUserPoint] = useState<WaypointMapPoint | null>(null);
  const hasRequestedInitialLocationRef = useRef(false);
  const markersRef = useRef<GoogleMarker[]>([]);
  const circlesRef = useRef<GoogleCircle[]>([]);
  const fittedMapRef = useRef<GoogleMap | null>(null);
  const onPickRef = useRef(onPick);
  useEffect(() => { onPickRef.current = onPick; }, [onPick]);
  const selectedWaypointExists = useMemo(
    () => waypoints.some((waypoint) => waypoint.sortOrder === selectedSlotIndex),
    [selectedSlotIndex, waypoints]
  );

  const allPoints = useMemo(() => {
    const points = waypoints.filter((waypoint) => !currentPoint || waypoint.sortOrder !== selectedSlotIndex).map((waypoint) => ({
      latitude: waypoint.latitude,
      longitude: waypoint.longitude,
    }));

    if (currentPoint) {
      points.push(currentPoint);
    }

    return points;
  }, [currentPoint, selectedSlotIndex, waypoints]);

  const initialCenter = useMemo(
    () =>
      currentPoint ?? allPoints[0] ?? {
        latitude: userPoint?.latitude ?? -27.46977,
        longitude: userPoint?.longitude ?? 153.02512,
      },
    [allPoints, currentPoint, userPoint]
  );

  const applyUserLocation = useCallback(
    (point: WaypointMapPoint) => {
      setUserPoint(point);
      setLocationMessage(null);

      if (map) {
        map.setCenter(toGooglePoint(point));
        map.setZoom(15);
      }

      if (autoPickUserLocation && !currentPoint && !selectedWaypointExists) {
        onPick(point);
      }
    },
    [autoPickUserLocation, currentPoint, map, onPick, selectedWaypointExists]
  );

  const requestUserLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationMessage("Location is not available in this browser.");
      return;
    }

    setIsLocating(true);
    setLocationMessage(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        applyUserLocation({
          latitude: roundCoordinate(position.coords.latitude),
          longitude: roundCoordinate(position.coords.longitude),
        });
        setIsLocating(false);
      },
      (error) => {
        setIsLocating(false);
        setLocationMessage(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Allow location access for this site, then try again."
            : "Unable to get your location. You can still click the map or enter coordinates."
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15_000,
        timeout: 10_000,
      }
    );
  }, [applyUserLocation]);

  useEffect(() => {
    if (hasRequestedInitialLocationRef.current || !navigator.geolocation) {
      return;
    }

    hasRequestedInitialLocationRef.current = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        applyUserLocation({
          latitude: roundCoordinate(position.coords.latitude),
          longitude: roundCoordinate(position.coords.longitude),
        });
      },
      () => undefined,
      {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 8_000,
      }
    );
  }, [applyUserLocation]);

  useEffect(() => {
    if (!autoPickUserLocation || !userPoint || currentPoint || selectedWaypointExists) {
      return;
    }

    onPick(userPoint);
  }, [autoPickUserLocation, currentPoint, onPick, selectedWaypointExists, userPoint]);

  useEffect(() => {
    let isMounted = true;
    const googleWindow = window as GoogleWindow;
    const previousAuthFailure = googleWindow.gm_authFailure;

    googleWindow.gm_authFailure = () => {
      if (isMounted) {
        setLoadError(
          "Google Maps rejected this browser key. Check that Maps JavaScript API is enabled, billing is active, and the key allows this site URL."
        );
      }

      previousAuthFailure?.();
    };

    loadGoogleMaps()
      .then((api) => {
        if (isMounted) {
          setMapsApi(api);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setLoadError(error instanceof Error ? error.message : "Unable to load Google Maps.");
        }
      });

    return () => {
      isMounted = false;
      googleWindow.gm_authFailure = previousAuthFailure;
    };
  }, []);

  useEffect(() => {
    if (!containerNode || !mapsApi || map) {
      return;
    }

    const nextMap = new mapsApi.Map(containerNode, {
      center: toGooglePoint(initialCenter),
      clickableIcons: false,
      fullscreenControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      zoom: allPoints.length > 0 ? 14 : 11,
    });

    nextMap.addListener("click", (event) => {
      const point = toPoint(event.latLng);
      if (point) {
        onPickRef.current(point);
      }
    });

    setMap(nextMap);
  }, [allPoints.length, containerNode, initialCenter, map, mapsApi, onPick]);

  useEffect(() => {
    if (!map || !mapsApi) {
      return;
    }

    for (const marker of markersRef.current) {
      marker.setMap(null);
    }

    markersRef.current = [];

    for (const waypoint of waypoints) {
      const isSelected = waypoint.sortOrder === selectedSlotIndex;
      const marker = new mapsApi.Marker({
        clickable: true,
        draggable: isSelected,
        icon: createMarkerIcon(mapsApi, isSelected ? "#0f766e" : COLORS.inactive),
        label: {
          color: COLORS.surface,
          ...FONT_WEIGHT.display,
          text: String(waypoint.sortOrder + 1),
        },
        map,
        position: toGooglePoint(isSelected && currentPoint ? currentPoint : waypoint),
        title: waypoint.name,
      });

      if (isSelected) {
        marker.addListener("dragend", (event) => {
          const point = toPoint(event.latLng);
          if (point) {
            onPick(point);
          }
        });
      }

      markersRef.current.push(marker);
    }

    if (currentPoint && !waypoints.some((waypoint) => waypoint.sortOrder === selectedSlotIndex)) {
      const marker = new mapsApi.Marker({
        draggable: true,
        icon: createMarkerIcon(mapsApi, "#0f766e"),
        label: {
          color: COLORS.surface,
          ...FONT_WEIGHT.display,
          text: String(selectedSlotIndex + 1),
        },
        map,
        position: toGooglePoint(currentPoint),
        title: `Waypoint ${selectedSlotIndex + 1}`,
      });

      marker.addListener("dragend", (event) => {
        const point = toPoint(event.latLng);
        if (point) {
          onPick(point);
        }
      });

      markersRef.current.push(marker);
    }

    return () => {
      for (const marker of markersRef.current) {
        marker.setMap(null);
      }
      markersRef.current = [];
    };
  }, [currentPoint, map, mapsApi, onPick, selectedSlotIndex, waypoints]);

  useEffect(() => {
    if (!map || !mapsApi) {
      return;
    }

    for (const circle of circlesRef.current) {
      circle.setMap(null);
    }

    circlesRef.current = [];

    for (const waypoint of waypoints) {
      const isSelected = waypoint.sortOrder === selectedSlotIndex;
      const circle = new mapsApi.Circle({
        clickable: false,
        center: toGooglePoint(isSelected && currentPoint ? currentPoint : waypoint),
        fillColor: isSelected ? "#0f766e" : COLORS.inactive,
        fillOpacity: isSelected ? 0.14 : 0.08,
        map,
        radius: isSelected && currentPoint ? radiusMeters : waypoint.radiusMeters,
        strokeColor: isSelected ? "#0f766e" : COLORS.inactive,
        strokeOpacity: isSelected ? 0.8 : 0.38,
        strokeWeight: isSelected ? 2 : 1,
      });

      circlesRef.current.push(circle);
    }

    if (currentPoint && !waypoints.some((waypoint) => waypoint.sortOrder === selectedSlotIndex)) {
      const circle = new mapsApi.Circle({
        clickable: false,
        center: toGooglePoint(currentPoint),
        fillColor: "#0f766e",
        fillOpacity: 0.14,
        map,
        radius: radiusMeters,
        strokeColor: "#0f766e",
        strokeOpacity: 0.8,
        strokeWeight: 2,
      });

      circlesRef.current.push(circle);
    }

    return () => {
      for (const circle of circlesRef.current) {
        circle.setMap(null);
      }
      circlesRef.current = [];
    };
  }, [currentPoint, map, mapsApi, radiusMeters, selectedSlotIndex, waypoints]);

  useEffect(() => {
    if (!map || !mapsApi || allPoints.length === 0 || fittedMapRef.current === map) {
      return;
    }

    // Fit once on load; editing coordinates must preserve the user's viewport.
    fittedMapRef.current = map;

    if (allPoints.length === 1) {
      map.setCenter(toGooglePoint(allPoints[0]));
      map.setZoom(15);
      return;
    }

    const bounds = new mapsApi.LatLngBounds();
    for (const point of allPoints) {
      bounds.extend(toGooglePoint(point));
    }
    map.fitBounds(bounds);
  }, [allPoints, map, mapsApi]);

  useEffect(() => {
    if (!map || allPoints.length > 0 || !userPoint) {
      return;
    }

    map.setCenter(toGooglePoint(userPoint));
    map.setZoom(15);
  }, [allPoints.length, map, userPoint]);

  if (!mapsApiKey) {
    return (
      <MapMessage textStyle={textStyle}
        title="Map key missing"
        text="Set EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY to use the map picker. You can still enter coordinates manually."
      />
    );
  }

  if (loadError) {
    return <MapMessage textStyle={textStyle} title="Map unavailable" text={loadError} />;
  }

  return (
    <View style={styles.shell}>
      <View
        ref={(node) => {
          setContainerNode(node as unknown as HTMLElement | null);
        }}
        style={styles.mapCanvas}
      />
      {!mapsApi ? (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator accessibilityLabel="Loading map" color={COLORS.primary} />
        </View>
      ) : null}
      {mapsApi ? (
        <View style={styles.locationControl}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use my location"
            accessibilityState={{ busy: isLocating, disabled: isLocating }}
            disabled={isLocating}
            onPress={requestUserLocation}
            style={[styles.locationButton, isLocating ? styles.locationButtonDisabled : null]}
          >
            {isLocating ? <ActivityIndicator accessibilityLabel="Finding your location" size="small" color={COLORS.primary} /> : <Text style={[textStyle, styles.locationButtonText]}>Use my location</Text>}
          </Pressable>
          {locationMessage ? <Text style={[styles.locationMessage, textStyle]}>{locationMessage}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function MapMessage({ text, title, textStyle }: { text: string; title: string; textStyle?: StyleProp<TextStyle> }) {
  return (
    <View style={styles.messagePanel}>
      <Text style={[styles.messageTitle, textStyle]}>{title}</Text>
      <Text style={[styles.messageText, textStyle]}>{text}</Text>
    </View>
  );
}

function toPoint(latLng: GoogleLatLng | null | undefined): WaypointMapPoint | null {
  if (!latLng) {
    return null;
  }

  return {
    latitude: roundCoordinate(latLng.lat()),
    longitude: roundCoordinate(latLng.lng()),
  };
}

function roundCoordinate(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function toGooglePoint(point: WaypointMapPoint): GooglePoint {
  return {
    lat: point.latitude,
    lng: point.longitude,
  };
}

function createMarkerIcon(mapsApi: GoogleMapsApi, color: string) {
  return {
    fillColor: color,
    fillOpacity: 1,
    path: mapsApi.SymbolPath.CIRCLE,
    scale: 14,
    strokeColor: COLORS.surface,
    strokeWeight: 3,
  };
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: "#faf9f7",
    borderColor: "#ded8ce",
    borderRadius: 8,
    borderWidth: 1,
    height: 360,
    minHeight: 320,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  mapCanvas: {
    height: "100%",
    width: "100%",
  },
  loadingOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.82)",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  locationButton: {
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderColor: "#c9c2b8",
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 12,
  },
  locationButtonDisabled: {
    opacity: 0.65,
  },
  locationButtonText: {
    ...TEXT_STYLE.button,
    color: COLORS.primary,
  },
  locationControl: {
    gap: 6,
    left: 10,
    maxWidth: 280,
    position: "absolute",
    top: 10,
  },
  locationMessage: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderRadius: 6,
    borderWidth: 1,
    color: "#9a3412",
    ...textMetrics(FONT_SIZE.caption),
    ...FONT_WEIGHT.bold,

    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  messagePanel: {
    backgroundColor: "#faf9f7",
    borderColor: "#e6e1d8",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 320,
    padding: 16,
  },
  messageTitle: {
    color: "#111827",
    ...textMetrics(FONT_SIZE.input),
    ...FONT_WEIGHT.display,
  },
  messageText: { ...FONT_WEIGHT.regular,
    color: "#4b5563",
    ...textMetrics(FONT_SIZE.small),

    marginTop: 6,
  },
});
