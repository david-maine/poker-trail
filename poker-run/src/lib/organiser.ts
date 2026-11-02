import { Session } from "@supabase/supabase-js";

import { supabase } from "./supabase";

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
  status: OrganiserEventStatus;
  starts_at: string | null;
  ends_at: string | null;
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
  name: string;
  description: string | null;
  status: OrganiserEventStatus;
  startsAt: string | null;
  endsAt: string | null;
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
  "id, slug, event_code, name, description, status, starts_at, ends_at, created_by, created_at, updated_at";

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
    payload.status = "active";
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

  if (!Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)) {
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
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
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
