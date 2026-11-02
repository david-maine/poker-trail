import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import * as Location from "expo-location";

const MIN_HEADING_CHANGE_DEGREES = 3;

export default function useLocation() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const headingRef = useRef<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let positionSubscription: Location.LocationSubscription | null = null;
    let headingSubscription: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorMsg("Permission to access location was denied");
        return;
      }

      positionSubscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 },
        (loc) => mounted && setLocation(loc)
      );

      headingSubscription = await Location.watchHeadingAsync((nextHeading) => {
        if (mounted) {
          setStableHeading(getBestHeading(nextHeading), headingRef, setHeading);
        }
      });
    })();

    return () => {
      mounted = false;
      positionSubscription?.remove();
      headingSubscription?.remove();
    };
  }, []);

  return { location, heading, errorMsg };
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
