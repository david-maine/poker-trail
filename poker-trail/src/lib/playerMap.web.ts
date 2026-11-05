import type { Waypoint } from "../types";
import type { GoogleCircle, GoogleMap, GoogleMapsApi, GoogleMarker } from "./googleMaps.web";
import type { MapControlLayout } from "./responsiveLayout";

export type PlayerMapState = {
  controls?: MapControlLayout;
  waypoints: Waypoint[];
  visited: Record<string, boolean>;
  userLocation: { latitude: number; longitude: number; heading?: number | null } | null;
};

const point = (position: { latitude: number; longitude: number }) => ({ lat: position.latitude, lng: position.longitude });

export function createPlayerMap(api: GoogleMapsApi, element: HTMLElement, initial: PlayerMapState) {
  const center = initial.userLocation ?? initial.waypoints[0] ?? { latitude: 0, longitude: 0 };
  const map: GoogleMap = new api.Map(element, {
    center: point(center), zoom: initial.userLocation ? 15 : 13,
    clickableIcons: false, fullscreenControl: false, mapTypeControl: false,
    streetViewControl: false, zoomControl: false, gestureHandling: "greedy",
  });
  let latest = initial;
  let markers: GoogleMarker[] = [];
  let circles: GoogleCircle[] = [];
  let userMarker: GoogleMarker | null = null;
  let waypointSignature = "";
  let centeredOnUser = Boolean(initial.userLocation);

  function update(state: PlayerMapState) {
    latest = state;
    const signature = JSON.stringify([state.waypoints, state.visited]);
    if (signature !== waypointSignature) {
      waypointSignature = signature;
      markers.forEach(marker => marker.setMap(null));
      circles.forEach(circle => circle.setMap(null));
      markers = [];
      circles = [];
      state.waypoints.forEach((waypoint, index) => {
        const color = state.visited[waypoint.id] ? "#228b22" : "#dc143c";
        markers.push(new api.Marker({ map, position: point(waypoint), title: waypoint.name,
          label: { text: String(index + 1), color: "#ffffff", fontWeight: "700" },
          icon: { path: api.SymbolPath.CIRCLE, scale: 12, fillColor: color, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 },
        }));
        circles.push(new api.Circle({ map, center: point(waypoint), radius: waypoint.radiusMeters ?? 20,
          fillColor: color, fillOpacity: 0.15, strokeColor: color, strokeOpacity: 0.7, strokeWeight: 2, clickable: false,
        }));
      });
    }
    if (state.userLocation) {
      const heading = state.userLocation.heading;
      const directed = typeof heading === "number" && Number.isFinite(heading) && heading >= 0;
      const icon = { path: directed ? "M 0,-12 L 8,10 L 0,6 L -8,10 Z" : api.SymbolPath.CIRCLE,
        scale: directed ? 1 : 8, rotation: directed ? heading % 360 : 0,
        fillColor: "#2878f0", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 };
      if (!userMarker) userMarker = new api.Marker({ map, position: point(state.userLocation), title: "Your location", icon, zIndex: 1000 });
      else { userMarker.setPosition(point(state.userLocation)); userMarker.setIcon(icon); }
      if (!centeredOnUser) { map.setCenter(point(state.userLocation)); centeredOnUser = true; }
    } else {
      userMarker?.setMap(null);
      userMarker = null;
    }
  }

  update(initial);
  return {
    update,
    recenter() { if (latest.userLocation) { map.setCenter(point(latest.userLocation)); map.setZoom(15); } },
    destroy() {
      markers.forEach(marker => marker.setMap(null));
      circles.forEach(circle => circle.setMap(null));
      userMarker?.setMap(null);
    },
  };
}
