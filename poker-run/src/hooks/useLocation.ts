import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { Platform } from "react-native";
import * as Location from "expo-location";
import { startBrowserLocation } from "../lib/browserLocation";

const MIN_HEADING_CHANGE_DEGREES = 3;

export default function useLocation() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const headingRef = useRef<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retryLocation = useCallback(() => {
    setLocation(null);
    setErrorMsg(null);
    setHeading(null);
    headingRef.current = null;
    setAttempt(value => value + 1);
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") {
      return startBrowserLocation({
        geolocation: typeof navigator !== "undefined" ? navigator.geolocation : undefined,
        secureContext: typeof window !== "undefined" ? window.isSecureContext : undefined,
      }, position => {
        setLocation({ timestamp: position.timestamp, coords: {
          latitude: position.coords.latitude, longitude: position.coords.longitude,
          accuracy: position.coords.accuracy, altitude: position.coords.altitude,
          altitudeAccuracy: position.coords.altitudeAccuracy, heading: position.coords.heading, speed: position.coords.speed,
        } });
        setErrorMsg(null);
        const direction = position.coords.heading;
        setHeading(typeof direction === "number" && Number.isFinite(direction) && direction >= 0 ? direction : null);
      }, setErrorMsg);
    }
    let mounted = true;
    let positionSubscription: Location.LocationSubscription | null = null;
    let headingSubscription: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!mounted) return;
      if (status !== "granted") {
        setErrorMsg("Permission to access location was denied");
        return;
      }

      positionSubscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 },
        (loc) => { if (mounted) { setLocation(loc); setErrorMsg(null); } },
        message => { if (mounted) setErrorMsg(message); }
      );
      if (!mounted) { positionSubscription.remove(); return; }

      headingSubscription = await Location.watchHeadingAsync((nextHeading) => {
        if (mounted) {
          setStableHeading(getBestHeading(nextHeading), headingRef, setHeading);
        }
      }).catch(() => null); // A compass is optional; it must not prevent GPS tracking.
      if (!mounted) headingSubscription?.remove();
    })().catch(() => {
      if (mounted) setErrorMsg("Unable to get your location. Check Location Services and your location permission, then retry.");
    });

    return () => {
      mounted = false;
      positionSubscription?.remove();
      headingSubscription?.remove();
    };
  }, [attempt]);

  return { location, heading, errorMsg, retryLocation };
}

function setStableHeading(
  nextHeading: number | null,
  headingRef: MutableRefObject<number | null>,
  setHeading: (heading: number | null) => void
) {
  const previousHeading = headingRef.current;

  if (nextHeading === null) {
    if (previousHeading !== null) {
      headingRef.current = null;
      setHeading(null);
    }
    return;
  }

  if (
    previousHeading !== null &&
    getHeadingDelta(previousHeading, nextHeading) < MIN_HEADING_CHANGE_DEGREES
  ) {
    return;
  }

  headingRef.current = nextHeading;
  setHeading(nextHeading);
}

function getBestHeading(heading: Location.LocationHeadingObject) {
  if (Number.isFinite(heading.trueHeading) && heading.trueHeading >= 0) {
    return heading.trueHeading;
  }

  if (Number.isFinite(heading.magHeading) && heading.magHeading >= 0) {
    return heading.magHeading;
  }

  return null;
}

function getHeadingDelta(first: number, second: number) {
  const difference = Math.abs(first - second) % 360;
  return difference > 180 ? 360 - difference : difference;
}
