export type WaypointDraft = { latitude: string; longitude: string; radius: string };
export type WaypointSetup = { slotIndex: number; latitude: number; longitude: number; radiusMeters: number };

export const emptyWaypointDraft = (): WaypointDraft => ({ latitude: '', longitude: '', radius: '20' });

export function parseWaypointDraft(draft: WaypointDraft, slotIndex: number): WaypointSetup | null {
  const latitude = Number(draft.latitude), longitude = Number(draft.longitude), radiusMeters = Number(draft.radius);
  if (!draft.latitude.trim() || !draft.longitude.trim() || !draft.radius.trim()
    || !Number.isFinite(latitude) || Math.abs(latitude) > 90
    || !Number.isFinite(longitude) || Math.abs(longitude) > 180
    || !Number.isInteger(radiusMeters) || radiusMeters <= 0 || radiusMeters > 2147483647) return null;
  return { slotIndex, latitude, longitude, radiusMeters };
}

export function validateWaypointSet(waypoints: WaypointSetup[]): void {
  if (waypoints.length !== 5 || new Set(waypoints.map(point => point.slotIndex)).size !== 5
    || waypoints.some(point => !Number.isInteger(point.slotIndex) || point.slotIndex < 0 || point.slotIndex > 4
      || !parseWaypointDraft({ latitude: String(point.latitude), longitude: String(point.longitude), radius: String(point.radiusMeters) }, point.slotIndex))) {
    throw new Error('Set all five waypoints with valid coordinates and a positive whole-number radius.');
  }
}
