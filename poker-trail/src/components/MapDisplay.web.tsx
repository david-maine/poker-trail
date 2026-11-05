import { APP_BACKGROUND_COLOR } from "../lib/theme";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import StatusPill from "./StatusPill";

import { loadGoogleMaps } from "../lib/googleMaps.web";
import type { GoogleWindow } from "../lib/googleMaps.web";
import { createPlayerMap } from "../lib/playerMap.web";
import type { PlayerMapState } from "../lib/playerMap.web";

export default function MapDisplay(props: PlayerMapState) {
  const controls = props.controls ?? { top: 56, left: 16, size: 48 };
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const controller = useRef<ReturnType<typeof createPlayerMap> | null>(null);
  const latest = useRef(props);
  useEffect(() => { latest.current = props; controller.current?.update(props); }, [props]);
  const mapNode = useCallback((element: View | null) => setNode(element as unknown as HTMLElement | null), []);

  useEffect(() => {
    if (!node) return;
    let active = true;
    setLoading(true);
    setError(null);
    const browser = window as GoogleWindow;
    const previousAuthFailure = browser.gm_authFailure;
    const authFailure = () => {
      if (active) { setError("Map access was denied for this site. Please contact the event organiser."); setLoading(false); }
      previousAuthFailure?.();
    };
    browser.gm_authFailure = authFailure;
    loadGoogleMaps().then(api => {
      if (!active) return;
      controller.current = createPlayerMap(api, node, latest.current);
      setLoading(false);
    }).catch(reason => {
      if (active) { setError(reason instanceof Error ? reason.message : "Unable to load the map."); setLoading(false); }
    });
    return () => {
      active = false;
      controller.current?.destroy();
      controller.current = null;
      if (browser.gm_authFailure === authFailure) browser.gm_authFailure = previousAuthFailure;
    };
  }, [node, attempt]);

  return (
    <View style={styles.container}>
      <View accessibilityLabel="Event map" ref={mapNode} style={styles.map} />
      {loading || error ? (
        <View style={styles.message}>
          <StatusPill message={error ?? "Loading map…"} loading={loading && !error} error={Boolean(error)}
            onRetry={error ? () => setAttempt(value => value + 1) : undefined} retryLabel="Retry map" />
        </View>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Recenter map on your location"
        disabled={loading || Boolean(error) || !props.userLocation} onPress={() => controller.current?.recenter()}
        style={({ pressed }) => [styles.recenter, { top: controls.top, left: controls.left, width: controls.size, height: controls.size, borderRadius: controls.size / 2 }, pressed && styles.pressed, (loading || Boolean(error) || !props.userLocation) && styles.disabled]}>
        <Image accessible={false} source={require("../../assets/images/POKER-TRAIL-icon-location.png")} resizeMode="contain" style={styles.controlIcon} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  controlIcon: { width: "100%", height: "100%" },
  container: { flex: 1, width: "100%", height: "100%", position: "relative", backgroundColor: APP_BACKGROUND_COLOR },
  map: { width: "100%", height: "100%" },
  recenter: { position: "absolute", top: 56, left: 16, width: 48, height: 48, borderRadius: 24, backgroundColor: "#ffffff",
    alignItems: "center", justifyContent: "center", shadowColor: "#000000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4, zIndex: 3 },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.45 },
  message: { position: "absolute", top: "50%", left: 24, right: 24, alignItems: "center", zIndex: 2 },
});
