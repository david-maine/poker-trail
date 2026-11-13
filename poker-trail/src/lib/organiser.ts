import { Session } from "@supabase/supabase-js";

import { organiserSupabase as supabase } from "./organiserSupabase";
import { parseWaypointDraft, validateWaypointSet } from './organiserWaypointDraft';
import type { WaypointSetup } from './organiserWaypointDraft';

export type OrganiserEventStatus = "draft" | "active" | "closed" | "archived";
export type OrganiserProofType = "gps" | "qr" | "code" | "staff";

type OrganiserProfileRow = {
  user_id: string;
  display_name: string;
  created_at: string;
  updated_at: string;
};

type OrganiserEventRow = {
  id: string;
  slug: string;
  event_code: string;
  name: string;
  description: string | null;
  player_capacity: number | null;
  requested_capacity: number | null;
  registrations_paused: boolean;
  status: OrganiserEventStatus;
  starts_at: string | null;
  ends_at: string | null;
  first_published_at: string | null;
  expires_at: string | null;
  lifecycle_managed: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type OrganiserWaypointRow = {
  id: string;
  event_id: string;
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  sort_order: number;
  proof_type: OrganiserProofType;
  proof_value: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type OrganiserRunRow = {
  event_id: string;
  status: "active" | "completed" | "abandoned";
  visit_count: number;
};

export type OrganiserProfile = {
  userId: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
};

export type OrganiserEvent = {
  id: string;
  slug: string;
  eventCode: string;
  playerCapacity: number | null;
  requestedCapacity: number | null;
  registrationsPaused: boolean;
  name: string;
  description: string | null;
  status: OrganiserEventStatus;
  startsAt: string | null;
  endsAt: string | null;
  firstPublishedAt: string | null;
  expiresAt: string | null;
  lifecycleManaged: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrganiserWaypoint = {
  id: string;
  eventId: string;
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  sortOrder: number;
  proofType: OrganiserProofType;
  proofValue: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OrganiserEventSummary = {
  eventId: string;
  waypointCount: number;
  activeWaypointCount: number;
  playerCount: number;
  activeRunCount: number;
  completedRunCount: number;
  totalVisitCount: number;
};

export type OrganiserDashboard = {
  session: Session;
  profile: OrganiserProfile;
  events: OrganiserEvent[];
  waypoints: OrganiserWaypoint[];
  summaries: Record<string, OrganiserEventSummary>;
};

export type OrganiserLeaderboardEntry = {
  run_id: string;
  started_at: string;
  finished_at: string | null;
  player_label: string;
  leaderboard_rank: number;
  visit_count: number;
  total_waypoints: number;
  best_hand_name: string | null;
  best_hand_cards: string[] | null;
};

export async function loadOrganiserLeaderboard(eventId: string, signal: AbortSignal): Promise<OrganiserLeaderboardEntry[]> {
  const entries: OrganiserLeaderboardEntry[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('leaderboard_entries')
      .select('run_id, started_at, finished_at, player_label, leaderboard_rank, visit_count, total_waypoints, best_hand_name, best_hand_cards')
      .eq('event_id', eventId).order('leaderboard_rank', { ascending: true }).order('run_id', { ascending: true })
      .range(offset, offset + 999).abortSignal(signal);
    if (error) throw error;
    const page = (data ?? []) as OrganiserLeaderboardEntry[];
    entries.push(...page);
    if (page.length < 1000) return entries;
  }
}

export type OrganiserEventInput = {
  id?: string | null;
  name: string;
};

export type OrganiserWaypointInput = {
  id?: string | null;
  eventId: string;
  slotIndex: number;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

const eventSelect =
  "id, slug, event_code, name, description, player_capacity, requested_capacity, registrations_paused, status, starts_at, ends_at, first_published_at, expires_at, lifecycle_managed, created_by, created_at, updated_at";

const waypointSelect =
  "id, event_id, code, name, latitude, longitude, radius_meters, sort_order, proof_type, proof_value, is_active, created_at, updated_at";

export async function getOrganiserSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  if (!session || isAnonymousSession(session)) {
    return {
      session: null,
      profile: null,
    };
  }

  const profile =
    (await fetchOrganiserProfile(session.user.id)) ??
    (session.user.email ? await upsertProfileForSession(session, session.user.email) : null);

  return {
    session,
    profile,
  };
}

export async function signUpOrganiser(
  email: string,
  password: string
) {
  await clearAnonymousSession();

  const normalizedEmail = normalizeRequiredText(email, "Email");
  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
  });

  if (error) {
    throw error;
  }

  const session = data.session ?? (await getOrganiserSession()).session;

  if (!session) {
    throw new Error("Check your email to finish creating your organiser account.");
  }

  await upsertProfileForSession(session, normalizedEmail);
  return getOrganiserSession();
}

export async function signInOrganiser(email: string, password: string) {
  await clearAnonymousSession();

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    throw error;
  }

  return getOrganiserSession();
}

export async function signOutOrganiser() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function saveOrganiserProfile(displayName: string): Promise<OrganiserProfile> {
  const authState = await getOrganiserSession();

  if (!authState.session) {
    throw new Error("Sign in to create an organiser profile.");
  }

  return upsertProfileForSession(authState.session, displayName);
}

async function upsertProfileForSession(
  session: Session,
  displayName: string
): Promise<OrganiserProfile> {
  const payload = {
    user_id: session.user.id,
    display_name: createDefaultDisplayName(displayName),
  };

  const { data, error } = await supabase
    .from("organizer_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("user_id, display_name, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }

  return mapProfileRow(data as OrganiserProfileRow);
}

export async function loadOrganiserDashboard(): Promise<OrganiserDashboard> {
  const authState = await getOrganiserSession();

  if (!authState.session) {
    throw new Error("Sign in to manage organiser events.");
  }

  if (!authState.profile) {
    throw new Error("Create an organiser profile to manage events.");
  }

  const [eventsResult, runsResult] = await Promise.all([
    supabase
      .from("events")
      .select(eventSelect)
      .eq("created_by", authState.session.user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("runs")
      .select("event_id, status, visit_count"),
  ]);

  if (eventsResult.error) {
    throw eventsResult.error;
  }

  if (runsResult.error) {
    throw runsResult.error;
  }

  const events = ((eventsResult.data as OrganiserEventRow[] | null) ?? []).map(mapEventRow);
  const eventIds = events.map((event) => event.id);
  const waypoints = eventIds.length > 0 ? await fetchWaypoints(eventIds) : [];
  const eventIdSet = new Set(eventIds);
  const runs = ((runsResult.data as OrganiserRunRow[] | null) ?? []).filter((run) =>
    eventIdSet.has(run.event_id)
  );

  return {
    session: authState.session,
    profile: authState.profile,
    events,
    waypoints,
    summaries: buildSummaries(events, waypoints, runs),
  };
}

export async function deleteOrganiserEvent(eventId: string): Promise<void> {
  const { session } = await getOrganiserSession();
  if (!session) throw new Error('Sign in to delete organiser events.');
  const { data, error } = await supabase.from('events').delete()
    .eq('id', eventId).eq('created_by', session.user.id).select('id').single();
  if (error) throw error;
  if (!data) throw new Error('Event could not be deleted. Check your access and try again.');
}

export async function createOrganiserEventWithWaypoints(input: { name: string; waypoints: WaypointSetup[] }): Promise<OrganiserEvent> {
  const name = normalizeRequiredText(input.name, 'Event name');
  validateWaypointSet(input.waypoints);
  const { session } = await getOrganiserSession();
  if (!session) throw new Error('Sign in to create organiser events.');
  const { data, error } = await supabase.rpc('create_organiser_event_with_waypoints', {
    p_name: name,
    p_waypoints: input.waypoints.map(point => ({ slot_index: point.slotIndex, latitude: point.latitude, longitude: point.longitude, radius_meters: point.radiusMeters })),
  });
  if (error) throw error;
  return mapEventRow(data as OrganiserEventRow);
}

export async function saveOrganiserEvent(
  input: OrganiserEventInput
): Promise<OrganiserEvent> {
  const authState = await getOrganiserSession();

  if (!authState.session) {
    throw new Error("Sign in to save organiser events.");
  }

  const name = normalizeRequiredText(input.name, "Event name");
  const baseSlug = createSlug(name);
  const payload: {
    slug: string;
    name: string;
    description: string | null;
    created_by: string;
    status?: OrganiserEventStatus;
  } = {
    slug: input.id ? `${baseSlug}-${input.id.slice(0, 8)}` : `${baseSlug}-${Date.now().toString(36)}`,
    name,
    description: null,
    created_by: authState.session.user.id,
  };

  if (!input.id) {
    payload.status = "draft";
  }

  const query = input.id
    ? supabase
        .from("events")
        .update(payload)
        .eq("id", input.id)
        .eq("created_by", authState.session.user.id)
    : supabase.from("events").insert(payload);

  const { data, error } = await query.select(eventSelect).single();

  if (error) {
    throw error;
  }

  return mapEventRow(data as OrganiserEventRow);
}

export async function saveOrganiserWaypoint(
  input: OrganiserWaypointInput
): Promise<OrganiserWaypoint> {
  if (!Number.isInteger(input.slotIndex) || input.slotIndex < 0 || input.slotIndex > 4) {
    throw new Error("Waypoint slot must be between 1 and 5.");
  }

  const slotNumber = input.slotIndex + 1;
  const payload: {
    event_id: string;
    code: string;
    name: string;
    latitude: number;
    longitude: number;
    radius_meters: number;
    sort_order: number;
    proof_type: OrganiserProofType;
    proof_value: null;
    is_active: boolean;
  } = {
    event_id: input.eventId,
    code: `wp${slotNumber}`,
    name: `Waypoint ${slotNumber}`,
    latitude: input.latitude,
    longitude: input.longitude,
    radius_meters: input.radiusMeters,
    sort_order: input.slotIndex,
    proof_type: "gps",
    proof_value: null,
    is_active: true,
  };

  if (!Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude) || Math.abs(payload.latitude) > 90 || Math.abs(payload.longitude) > 180) {
    throw new Error("Latitude and longitude must be valid numbers.");
  }

  if (!Number.isInteger(payload.radius_meters) || payload.radius_meters <= 0) {
    throw new Error("Radius must be a positive whole number.");
  }

  const query = input.id
    ? supabase.from("waypoints").update(payload).eq("id", input.id)
    : supabase.from("waypoints").upsert(payload, {
        onConflict: "event_id,code",
      });

  const { data, error } = await query.select(waypointSelect).single();

  if (error) {
    throw error;
  }

  return mapWaypointRow(data as OrganiserWaypointRow);
}

async function fetchOrganiserProfile(userId: string): Promise<OrganiserProfile | null> {
  const { data, error } = await supabase
    .from("organizer_profiles")
    .select("user_id, display_name, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as OrganiserProfileRow | null;
  return row ? mapProfileRow(row) : null;
}

async function fetchWaypoints(eventIds: string[]) {
  const { data, error } = await supabase
    .from("waypoints")
    .select(waypointSelect)
    .in("event_id", eventIds)
    .order("sort_order", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data as OrganiserWaypointRow[] | null) ?? []).map(mapWaypointRow);
}

function buildSummaries(
  events: OrganiserEvent[],
  waypoints: OrganiserWaypoint[],
  runs: OrganiserRunRow[]
) {
  const summaries: Record<string, OrganiserEventSummary> = {};

  for (const event of events) {
    summaries[event.id] = {
      eventId: event.id,
      waypointCount: 0,
      activeWaypointCount: 0,
      playerCount: 0,
      activeRunCount: 0,
      completedRunCount: 0,
      totalVisitCount: 0,
    };
  }

  for (const waypoint of waypoints) {
    const summary = summaries[waypoint.eventId];
    if (!summary) {
      continue;
    }

    summary.waypointCount += 1;
    summary.activeWaypointCount += waypoint.isActive ? 1 : 0;
  }

  for (const run of runs) {
    const summary = summaries[run.event_id];
    if (!summary) {
      continue;
    }

    summary.playerCount += 1;
    summary.activeRunCount += run.status === "active" ? 1 : 0;
    summary.completedRunCount += run.status === "completed" ? 1 : 0;
    summary.totalVisitCount += run.visit_count;
  }

  return summaries;
}

function mapProfileRow(row: OrganiserProfileRow): OrganiserProfile {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEventRow(row: OrganiserEventRow): OrganiserEvent {
  return {
    id: row.id,
    slug: row.slug,
    eventCode: row.event_code,
    name: row.name,
    description: row.description,
    playerCapacity: row.player_capacity,
    requestedCapacity: row.requested_capacity,
    registrationsPaused: row.registrations_paused ?? false,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    firstPublishedAt: row.first_published_at,
    expiresAt: row.expires_at,
    lifecycleManaged: row.lifecycle_managed,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWaypointRow(row: OrganiserWaypointRow): OrganiserWaypoint {
  return {
    id: row.id,
    eventId: row.event_id,
    code: row.code,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusMeters: row.radius_meters,
    sortOrder: row.sort_order,
    proofType: row.proof_type,
    proofValue: row.proof_value,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeRequiredText(value: string, label: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function createSlug(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    throw new Error("Event name must include at least one letter or number.");
  }

  return slug;
}

function createDefaultDisplayName(email: string) {
  const normalized = normalizeRequiredText(email, "Email");
  const localPart = normalized.split("@")[0]?.trim();
  return localPart || normalized;
}

async function clearAnonymousSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  if (!session || !isAnonymousSession(session)) {
    return;
  }

  const { error: signOutError } = await supabase.auth.signOut();

  if (signOutError) {
    throw signOutError;
  }
}

function isAnonymousSession(session: Session) {
  return Boolean((session.user as { is_anonymous?: boolean }).is_anonymous);
}

export async function publishOrganiserEvent(eventId: string) {
  const { error } = await supabase.from("events").update({ status: "active" }).eq("id", eventId).select("id").single();
  if (error) throw error;
}

export async function closeOrganiserEvent(eventId: string): Promise<void> {
  const { session } = await getOrganiserSession();
  if (!session) throw new Error('Sign in to close organiser events.');
  const { error } = await supabase.from('events').update({ status: 'closed' })
    .eq('id', eventId).eq('created_by', session.user.id).eq('status', 'active').select('id').single();
  if (error) throw error;
}

export async function setOrganiserRegistrationsPaused(eventId: string, paused: boolean): Promise<void> {
  const { session } = await getOrganiserSession();
  if (!session) throw new Error('Sign in to change registrations.');
  const { data, error } = await supabase.from('events').update({ registrations_paused: paused })
    .eq('id', eventId).eq('created_by', session.user.id).eq('status', 'active').select('id').single();
  if (error) throw error;
  if (!data) throw new Error('Registration settings could not be saved.');
}

export async function requestOrganiserPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: typeof window === "undefined" ? undefined : window.location.origin + "/organiser/reset-password",
  });
  if (error) throw error;
}

export async function updateOrganiserPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function createOrganiserDraft(input: { name: string; waypoints: WaypointSetup[]; capacity: number }): Promise<OrganiserEvent> {
  const name = normalizeRequiredText(input.name, 'Event name');
  if (input.waypoints.length > 5 || new Set(input.waypoints.map(p => p.slotIndex)).size !== input.waypoints.length || input.waypoints.some(p => !Number.isInteger(p.slotIndex) || p.slotIndex < 0 || p.slotIndex > 4 || !parseWaypointDraft({ latitude: String(p.latitude), longitude: String(p.longitude), radius: String(p.radiusMeters) }, p.slotIndex))) throw new Error('Completed waypoints must have valid coordinates and radius.');
  const { session } = await getOrganiserSession();
  if (!session) throw new Error('Sign in to create organiser events.');
  const { data, error } = await supabase.rpc('create_organiser_event_draft', {
    p_name: name, p_capacity: input.capacity,
    p_waypoints: input.waypoints.map(p => ({ slot_index: p.slotIndex, latitude: p.latitude, longitude: p.longitude, radius_meters: p.radiusMeters })),
  });
  if (error) throw error;
  return mapEventRow(data as OrganiserEventRow);
}
export async function setRequestedEventCapacity(eventId: string, capacity: number): Promise<void> {
  const { session } = await getOrganiserSession();
  if (!session) throw new Error('Sign in to change event size.');
  const { error } = await supabase.from('events').update({ requested_capacity: capacity }).eq('id', eventId).eq('created_by', session.user.id).eq('status', 'draft').select('id').single();
  if (error) throw error;
}

export async function saveOrganiserDraft(input: { id: string; name: string; waypoints: WaypointSetup[]; capacity: number }): Promise<OrganiserEvent> {
  const name = normalizeRequiredText(input.name, 'Event name');
  const { session } = await getOrganiserSession();
  if (!session) throw new Error('Sign in to save organiser events.');
  const { data, error } = await supabase.rpc('save_organiser_event_draft', {
    p_event_id: input.id, p_name: name, p_capacity: input.capacity,
    p_waypoints: input.waypoints.map(point => ({ slot_index: point.slotIndex, latitude: point.latitude, longitude: point.longitude, radius_meters: point.radiusMeters })),
  });
  if (error) throw error;
  return mapEventRow(data as OrganiserEventRow);
}
