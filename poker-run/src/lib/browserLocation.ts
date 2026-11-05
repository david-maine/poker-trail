type BrowserLocationEnvironment = {
  geolocation?: Pick<Geolocation, "watchPosition" | "clearWatch">;
  secureContext?: boolean;
};
type Schedule = (callback: () => void, delay: number) => () => void;
const scheduleTimeout: Schedule = (callback, delay) => {
  const timer = setTimeout(callback, delay);
  return () => clearTimeout(timer);
};

export function startBrowserLocation(
  environment: BrowserLocationEnvironment,
  onPosition: (position: GeolocationPosition) => void,
  onError: (message: string) => void,
  schedule: Schedule = scheduleTimeout
) {
  if (environment.secureContext === false) {
    onError("Location requires HTTPS on your phone. Open the HTTPS preview link, then retry.");
    return () => {};
  }
  const geolocation = environment.geolocation;
  if (!geolocation) {
    onError("Location is not available in this browser. Open the app in Safari or Chrome.");
    return () => {};
  }
  let stopped = false;
  let watchId: number | undefined;
  // Browser timeout options do not bound how long a permission prompt can stay open.
  // Keep watching after this message so granting permission later can still recover.
  const cancelTimeout = schedule(() => {
    if (!stopped) onError("Still waiting for your location. Allow location access for this site, or tap Retry location.");
  }, 15000);
  try {
    watchId = geolocation.watchPosition(position => {
      if (stopped) return;
      cancelTimeout();
      if (!Number.isFinite(position.coords.latitude) || !Number.isFinite(position.coords.longitude)) {
        onError("Your browser returned an invalid location. Tap Retry location.");
        return;
      }
      onPosition(position);
    }, error => {
      if (stopped) return;
      cancelTimeout();
      if (error.code === 1) onError("Location access is blocked. Allow location for this site in your browser settings, then tap Retry location.");
      else if (error.code === 3) onError("Getting your location timed out. Check that Location Services is on, then tap Retry location.");
      else onError("Your browser could not determine your location. Check Location Services and try again.");
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  } catch {
    cancelTimeout();
    onError("Unable to start location tracking. Check your browser's location permission and try again.");
  }
  return () => {
    stopped = true;
    cancelTimeout();
    if (watchId !== undefined) geolocation.clearWatch(watchId);
  };
}
