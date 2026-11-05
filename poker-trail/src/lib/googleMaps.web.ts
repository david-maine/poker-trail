export type GoogleLatLng = {
  lat: () => number;
  lng: () => number;
};

export type GoogleMapMouseEvent = {
  latLng?: GoogleLatLng | null;
};

export type GoogleMapsApi = {
  Circle: new (options: Record<string, unknown>) => GoogleCircle;
  LatLngBounds: new () => GoogleBounds;
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  Marker: new (options: Record<string, unknown>) => GoogleMarker;
  SymbolPath: {
    CIRCLE: number;
  };
};

export type GoogleBounds = {
  extend: (point: GooglePoint) => void;
};

export type GoogleCircle = {
  setCenter: (point: GooglePoint | null) => void;
  setMap: (map: GoogleMap | null) => void;
  setOptions: (options: Record<string, unknown>) => void;
  setRadius: (radius: number) => void;
};

export type GoogleMap = {
  addListener: (eventName: string, listener: (event: GoogleMapMouseEvent) => void) => void;
  fitBounds: (bounds: GoogleBounds) => void;
  setCenter: (point: GooglePoint) => void;
  setZoom: (zoom: number) => void;
};

export type GoogleMarker = {
  addListener: (eventName: string, listener: (event: GoogleMapMouseEvent) => void) => void;
  setMap: (map: GoogleMap | null) => void;
  setPosition: (point: GooglePoint) => void;
  setIcon: (icon: Record<string, unknown>) => void;
};

export type GoogleWindow = Window &
  typeof globalThis & {
    gm_authFailure?: () => void;
    google?: {
      maps?: GoogleMapsApi;
    };
  };

export type GooglePoint = {
  lat: number;
  lng: number;
};

export const mapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY ?? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const scriptId = "google-maps-js-api";
let pending: Promise<GoogleMapsApi> | null = null;

// The organiser picker and player map share one script, including after navigating
// between routes. Failed loads may be retried without leaving a rejected cache.
export function loadGoogleMaps(): Promise<GoogleMapsApi> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("The map is available in the browser."));
  }
  const browser = window as GoogleWindow;
  if (browser.google?.maps?.Map) return Promise.resolve(browser.google.maps);
  if (!mapsApiKey) return Promise.reject(new Error("The web map is not configured. Contact the event organiser."));
  if (pending) return pending;
  pending = new Promise<GoogleMapsApi>((resolve, reject) => {
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    const cleanup = () => {
      clearTimeout(timeout);
      script.removeEventListener("load", loaded);
      script.removeEventListener("error", failed);
    };
    const failed = () => {
      cleanup();
      script.remove();
      reject(new Error("Unable to load the map. Check your connection and try again."));
    };
    const loaded = () => {
      if (!browser.google?.maps?.Map) { failed(); return; }
      cleanup();
      resolve(browser.google.maps);
    };
    const timeout = setTimeout(failed, 20000);
    script.addEventListener("load", loaded);
    script.addEventListener("error", failed);
    if (!existing) {
      script.id = scriptId;
      script.async = true;
      script.defer = true;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsApiKey)}`;
      document.head.appendChild(script);
    }
  }).catch(error => { pending = null; throw error; });
  return pending;
}
