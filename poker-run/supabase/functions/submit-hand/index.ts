import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_GPS_ACCURACY_METERS = 65;

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type SubmitHandPayload = {
  eventId?: string;
  claims?: SubmittedClaim[];
  clientScore?: Record<string, Json> | null;
};

type SubmittedClaim = {
  waypointId?: string;
  card?: string;
  claimedAt?: string;
  claimedLat?: number;
  claimedLng?: number;
  gpsAccuracyMeters?: number | null;
};

type RunRow = {
  id: string;
  event_id: string;
  user_id: string;
  display_name: string | null;
  status: "active" | "completed" | "abandoned";
  started_at: string;
  finished_at: string | null;
  last_claim_at: string | null;
  visit_count: number;
  best_hand_name: string;
  best_hand_rank: number;
  best_hand_cards: string[];
  tiebreaker: number[];
};

type WaypointRow = {
  id: string;
  event_id: string;
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  sort_order: number;
  is_active: boolean;
};

type EventRow = {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "active" | "closed" | "archived";
  starts_at: string | null;
  ends_at: string | null;
};

type ParsedCard = {
  card: string;
  rank: number;
  suit: string;
};

type HandScore = {
  name: string;
  rank: number;
  tiebreaker: number[];
  cards: string[];
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const env = getSupabaseEnv();
    const authHeader = request.headers.get("Authorization");

    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header." }, 401);
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return jsonResponse({ error: "Missing bearer token." }, 401);
    }

    const authClient = createClient(env.url, env.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    const userId = user?.id ?? extractUserIdFromJwt(token);

    if (authError || !userId) {
      return jsonResponse({ error: "Invalid or expired session." }, 401);
    }

    const payload = (await request.json()) as SubmitHandPayload;
    const validationError = validatePayload(payload);
    if (validationError) {
      return jsonResponse({ error: validationError }, 400);
    }

    const admin = createClient(env.url, env.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const eventId = payload.eventId!;
    const claims = payload.claims!.map(claim => ({
      waypointId: claim.waypointId, card: claim.card, claimedAt: claim.claimedAt,
      claimedLat: claim.claimedLat, claimedLng: claim.claimedLng,
      gpsAccuracyMeters: claim.gpsAccuracyMeters ?? null,
    }));
    const event = await fetchEvent(admin, eventId);

    if (!event) {
      return jsonResponse({ error: "Event not found." }, 404);
    }

    const eventTimingError = validateEventTiming(event, claims);
    if (eventTimingError) {
      return jsonResponse({ error: eventTimingError }, 409);
    }

    const waypoints = await fetchActiveWaypoints(admin, eventId);
    const run = await fetchRun(admin, eventId, userId);
    if (!run || !normalizeNullableString(run.display_name)) {
      return jsonResponse({ error: "Register a vessel name before submitting a hand." }, 409);
    }
    const { data: stored, error: storedError } = await admin.from("run_card_claims")
      .select("claim").eq("run_id", run.id);
    if (storedError) throw storedError;
    const accepted = (stored ?? []).map((row: { claim: SubmittedClaim }) => row.claim);
    if (claims.some(claim => accepted.some(previous => previous.waypointId === claim.waypointId && !sameRecordedClaim(previous, claim)))) {
      return jsonResponse({ error: "Accepted cards cannot be changed." }, 409);
    }
    const handError = validateHand(claims, waypoints, accepted);
    if (handError) {
      return jsonResponse({ error: handError, rejectedWaypointIds: claims.filter(claim => {
        const waypoint = waypoints.find(point => point.id === claim.waypointId);
        return waypoint && !accepted.some(previous => sameRecordedClaim(previous, claim)) &&
          (claim.gpsAccuracyMeters! > MAX_GPS_ACCURACY_METERS ||
            haversineMeters(claim.claimedLat!, claim.claimedLng!, waypoint.latitude, waypoint.longitude) > waypoint.radius_meters);
      }).map(claim => claim.waypointId) }, 422);
    }

    const bestHand = evaluateBestHand(claims.map((claim) => claim.card!));
    const { data: updatedRunData, error: updateRunError } = await admin.rpc("apply_hand_snapshot", {
      p_run_id: run.id,
      p_claims: claims,
      p_score: bestHand,
    });
    if (updateRunError) {
      if (updateRunError.code === "P0001" || updateRunError.code === "23505") {
        return jsonResponse({ error: updateRunError.message }, 409);
      }
      throw updateRunError;
    }
    if (!updatedRunData) throw new Error("Run update failed.");

    const updatedRun = updatedRunData.run as RunRow;
    const { data: leaderboardEntry, error: leaderboardError } = await admin
      .from("leaderboard_entries")
      .select("*")
      .eq("run_id", updatedRun.id)
      .maybeSingle();

    if (leaderboardError) {
      throw leaderboardError;
    }

    console.log("submit-hand accepted", {
      userId,
      eventId,
      runId: updatedRun.id,
      visitCount: updatedRun.visit_count,
      bestHandName: updatedRun.best_hand_name,
    });

    return jsonResponse({
      claims: updatedRunData.claims,
      event: {
        id: event.id,
        slug: event.slug,
        name: event.name,
      },
      run: mapRunResponse(updatedRun),
      leaderboardEntry,
    });
  } catch (error) {
    console.error("submit-hand failed", error);

    const message =
      error instanceof Error ? error.message : "Unexpected error while submitting hand.";

    return jsonResponse({ error: message }, 500);
  }
});

function validatePayload(payload: SubmitHandPayload) {
  if (!payload || typeof payload !== "object") {
    return "Request body must be a JSON object.";
  }

  if (typeof payload.eventId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.eventId)) {
    return "A valid eventId is required.";
  }

  if (!Array.isArray(payload.claims) || payload.claims.length === 0) {
    return "claims must contain at least one collected card.";
  }

  for (const claim of payload.claims) {
    if (!claim || typeof claim !== "object") {
      return "Each claim must be an object.";
    }

    if (typeof claim.waypointId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claim.waypointId)) {
      return "Each claim must include a valid waypointId.";
    }

    if (!claim.card || !isValidCard(claim.card)) {
      return "Each claim must include a valid card.";
    }

    if (typeof claim.claimedLat !== "number" || !Number.isFinite(claim.claimedLat) || Math.abs(claim.claimedLat) > 90) {
      return "Each claim must include claimedLat.";
    }

    if (typeof claim.claimedLng !== "number" || !Number.isFinite(claim.claimedLng) || Math.abs(claim.claimedLng) > 180) {
      return "Each claim must include claimedLng.";
    }

    if (
      claim.gpsAccuracyMeters !== undefined &&
      claim.gpsAccuracyMeters !== null &&
      (typeof claim.gpsAccuracyMeters !== "number" || !Number.isFinite(claim.gpsAccuracyMeters) || claim.gpsAccuracyMeters < 0)
    ) {
      return "gpsAccuracyMeters must be a number when provided.";
    }

    if (!claim.claimedAt || typeof claim.claimedAt !== "string") {
      return "Each claim must include claimedAt.";
    }

    const claimedAtMs = Date.parse(claim.claimedAt);
    if (Number.isNaN(claimedAtMs)) {
      return "claimedAt must be a valid ISO timestamp.";
    }

    if (claimedAtMs > Date.now() + 5 * 60 * 1000) {
      return "claimedAt cannot be in the future.";
    }
  }

  if (
    payload.clientScore !== undefined &&
    payload.clientScore !== null &&
    (typeof payload.clientScore !== "object" || Array.isArray(payload.clientScore))
  ) {
    return "clientScore must be an object when provided.";
  }

  return null;
}

function validateHand(claims: SubmittedClaim[], waypoints: WaypointRow[], accepted: SubmittedClaim[] = []) {
  if (claims.length < 1 || claims.length > waypoints.length) {
    return "Collect between one card and the number of active waypoints.";
  }

  const waypointsById = new Map(waypoints.map((waypoint) => [waypoint.id, waypoint]));
  const claimedWaypointIds = new Set<string>();
  const claimedCards = new Set<string>();

  for (const claim of claims) {
    const waypoint = waypointsById.get(claim.waypointId!);
    if (!waypoint) {
      return "Submitted hand includes a waypoint that is not active for this event.";
    }

    if (claimedWaypointIds.has(claim.waypointId!)) {
      return "Submitted hand includes the same waypoint more than once.";
    }

    if (claimedCards.has(claim.card!)) {
      return "Submitted hand includes the same card more than once.";
    }

    claimedWaypointIds.add(claim.waypointId!);
    claimedCards.add(claim.card!);

    // Accepted proofs remain valid if an organiser later moves or shrinks a waypoint.
    // Any change to an accepted proof still reaches the transaction's immutable check.
    if (accepted.some(previous => sameRecordedClaim(previous, claim))) continue;

    if (claim.gpsAccuracyMeters !== null && claim.gpsAccuracyMeters! > MAX_GPS_ACCURACY_METERS) {
      return `${waypoint.name}: GPS accuracy was too low. Return to this waypoint for a fresh location fix; your card will be kept.`;
    }

    const distanceMeters = haversineMeters(
      claim.claimedLat!,
      claim.claimedLng!,
      waypoint.latitude,
      waypoint.longitude
    );

    if (distanceMeters > waypoint.radius_meters) {
      return `${waypoint.name}: the saved card location is outside the current ${waypoint.radius_meters} m radius (${Math.ceil(distanceMeters)} m away). Return inside this waypoint to refresh its location proof; your card will be kept.`;
    }
  }

  return null;
}

function sameRecordedClaim(a: SubmittedClaim, b: SubmittedClaim) {
  return a.waypointId === b.waypointId && a.card === b.card && a.claimedAt === b.claimedAt &&
    a.claimedLat === b.claimedLat && a.claimedLng === b.claimedLng && (a.gpsAccuracyMeters ?? null) === (b.gpsAccuracyMeters ?? null);
}

function validateEventTiming(event: EventRow, claims: SubmittedClaim[]) {
  if (event.status !== "active") {
    return "This event is not currently accepting hand submissions.";
  }

  for (const claim of claims) {
    const claimedAtMs = Date.parse(claim.claimedAt!);

    if (event.starts_at && Date.parse(event.starts_at) > claimedAtMs) {
      return "This event had not started when one or more cards were collected.";
    }

    if (event.ends_at && Date.parse(event.ends_at) < claimedAtMs) {
      return "This event had already ended when one or more cards were collected.";
    }
  }

  return null;
}

function getSupabaseEnv() {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY in function environment."
    );
  }

  return { url, anonKey, serviceRoleKey };
}

function extractUserIdFromJwt(token: string) {
  const parts = token.split(".");

  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = decodeBase64Url(parts[1]);
    const claims = JSON.parse(payload) as { sub?: unknown };
    return typeof claims.sub === "string" && claims.sub.length > 0 ? claims.sub : null;
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function fetchEvent(client: ReturnType<typeof createClient>, eventId: string) {
  const { data, error } = await client
    .from("events")
    .select("id, slug, name, status, starts_at, ends_at")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as EventRow | null) ?? null;
}

async function fetchActiveWaypoints(client: ReturnType<typeof createClient>, eventId: string) {
  const { data, error } = await client
    .from("waypoints")
    .select("id, event_id, code, name, latitude, longitude, radius_meters, sort_order, is_active")
    .eq("event_id", eventId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as WaypointRow[];
}

async function fetchRun(
  client: ReturnType<typeof createClient>,
  eventId: string,
  userId: string
) {
  const { data, error } = await client
    .from("runs")
    .select("*")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as RunRow | null) ?? null;
}

function mapRunResponse(run: RunRow) {
  return {
    id: run.id,
    eventId: run.event_id,
    userId: run.user_id,
    status: run.status,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    visitCount: run.visit_count,
    bestHandName: run.best_hand_name,
    bestHandRank: run.best_hand_rank,
    bestHandCards: run.best_hand_cards,
    tiebreaker: run.tiebreaker,
  };
}

function normalizeNullableString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isValidCard(card: string) {
  return /^(10|[2-9JQKA])[SHDC]$/.test(card);
}

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function evaluateBestHand(cards: string[]): HandScore {
  if (cards.length === 0) {
    return {
      name: "Unranked",
      rank: 0,
      tiebreaker: [],
      cards: [],
    };
  }

  if (cards.length < 5) {
    return evaluatePartialHand(cards);
  }

  const combinations = chooseFive(cards);
  let best: HandScore | null = null;

  for (const combo of combinations) {
    const score = evaluateFiveCardHand(combo);

    if (!best || compareScores(score, best) > 0) {
      best = score;
    }
  }

  return best!;
}

function evaluatePartialHand(cards: string[]): HandScore {
  const parsed = cards.map(parseCard).sort((left, right) => right.rank - left.rank);
  const rankGroups = getRankGroups(parsed);
  const counts = rankGroups.map((group) => group.length).sort((left, right) => right - left);

  if (counts[0] === 4) {
    const quad = rankGroups.find((group) => group.length === 4)!;
    const kicker = rankGroups.find((group) => group.length === 1)?.[0];
    return {
      name: "Four of a Kind",
      rank: 8,
      tiebreaker: [quad[0].rank, kicker?.rank ?? 0],
      cards: sortCards(parsed).map((card) => card.card),
    };
  }

  if (counts[0] === 3) {
    const trips = rankGroups.find((group) => group.length === 3)!;
    const kickers = rankGroups
      .filter((group) => group.length === 1)
      .flat()
      .sort((left, right) => right.rank - left.rank)
      .map((card) => card.rank);

    return {
      name: "Three of a Kind",
      rank: 4,
      tiebreaker: [trips[0].rank, ...kickers],
      cards: sortCards(parsed).map((card) => card.card),
    };
  }

  const pairs = rankGroups
    .filter((group) => group.length === 2)
    .sort((left, right) => right[0].rank - left[0].rank);

  if (pairs.length >= 2) {
    const kicker = rankGroups.find((group) => group.length === 1)?.[0];
    return {
      name: "Two Pair",
      rank: 3,
      tiebreaker: [pairs[0][0].rank, pairs[1][0].rank, kicker?.rank ?? 0],
      cards: sortCards(parsed).map((card) => card.card),
    };
  }

  if (pairs.length === 1) {
    const kickers = rankGroups
      .filter((group) => group.length === 1)
      .flat()
      .sort((left, right) => right.rank - left.rank)
      .map((card) => card.rank);

    return {
      name: "Pair",
      rank: 2,
      tiebreaker: [pairs[0][0].rank, ...kickers],
      cards: sortCards(parsed).map((card) => card.card),
    };
  }

  return {
    name: "High Card",
    rank: 1,
    tiebreaker: parsed.map((card) => card.rank),
    cards: sortCards(parsed).map((card) => card.card),
  };
}

function evaluateFiveCardHand(cards: string[]): HandScore {
  const parsed = cards.map(parseCard);
  const sortedCards = sortCards(parsed);
  const rankGroups = getRankGroups(parsed);
  const isFlush = new Set(parsed.map((card) => card.suit)).size === 1;
  const straightHigh = getStraightHigh(parsed);

  if (isFlush && straightHigh === 14) {
    const royalRanks = new Set(sortedCards.map((card) => card.rank));
    if ([14, 13, 12, 11, 10].every((rank) => royalRanks.has(rank))) {
      return {
        name: "Royal Flush",
        rank: 10,
        tiebreaker: [14],
        cards: sortedCards.map((card) => card.card),
      };
    }
  }

  if (isFlush && straightHigh) {
    return {
      name: "Straight Flush",
      rank: 9,
      tiebreaker: [straightHigh],
      cards: sortStraightCards(parsed, straightHigh).map((card) => card.card),
    };
  }

  const fourGroup = rankGroups.find((group) => group.length === 4);
  if (fourGroup) {
    const kicker = rankGroups.find((group) => group.length === 1)![0];
    return {
      name: "Four of a Kind",
      rank: 8,
      tiebreaker: [fourGroup[0].rank, kicker.rank],
      cards: [...fourGroup, kicker].map((card) => card.card),
    };
  }

  const threeGroup = rankGroups.find((group) => group.length === 3);
  const pairGroup = rankGroups.find((group) => group.length === 2);
  if (threeGroup && pairGroup) {
    return {
      name: "Full House",
      rank: 7,
      tiebreaker: [threeGroup[0].rank, pairGroup[0].rank],
      cards: [...threeGroup, ...pairGroup].map((card) => card.card),
    };
  }

  if (isFlush) {
    return {
      name: "Flush",
      rank: 6,
      tiebreaker: sortedCards.map((card) => card.rank),
      cards: sortedCards.map((card) => card.card),
    };
  }

  if (straightHigh) {
    return {
      name: "Straight",
      rank: 5,
      tiebreaker: [straightHigh],
      cards: sortStraightCards(parsed, straightHigh).map((card) => card.card),
    };
  }

  if (threeGroup) {
    const kickers = rankGroups
      .filter((group) => group.length === 1)
      .flat()
      .sort((left, right) => right.rank - left.rank);

    return {
      name: "Three of a Kind",
      rank: 4,
      tiebreaker: [threeGroup[0].rank, ...kickers.map((card) => card.rank)],
      cards: [...threeGroup, ...kickers].map((card) => card.card),
    };
  }

  const pairGroups = rankGroups
    .filter((group) => group.length === 2)
    .sort((left, right) => right[0].rank - left[0].rank);

  if (pairGroups.length === 2) {
    const kicker = rankGroups.find((group) => group.length === 1)![0];
    return {
      name: "Two Pair",
      rank: 3,
      tiebreaker: [pairGroups[0][0].rank, pairGroups[1][0].rank, kicker.rank],
      cards: [...pairGroups[0], ...pairGroups[1], kicker].map((card) => card.card),
    };
  }

  if (pairGroups.length === 1) {
    const kickers = rankGroups
      .filter((group) => group.length === 1)
      .flat()
      .sort((left, right) => right.rank - left.rank);

    return {
      name: "Pair",
      rank: 2,
      tiebreaker: [pairGroups[0][0].rank, ...kickers.map((card) => card.rank)],
      cards: [...pairGroups[0], ...kickers].map((card) => card.card),
    };
  }

  return {
    name: "High Card",
    rank: 1,
    tiebreaker: sortedCards.map((card) => card.rank),
    cards: sortedCards.map((card) => card.card),
  };
}

function compareScores(left: HandScore, right: HandScore) {
  if (left.rank !== right.rank) {
    return left.rank > right.rank ? 1 : -1;
  }

  const length = Math.max(left.tiebreaker.length, right.tiebreaker.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left.tiebreaker[index] ?? 0;
    const rightValue = right.tiebreaker[index] ?? 0;

    if (leftValue !== rightValue) {
      return leftValue > rightValue ? 1 : -1;
    }
  }

  return 0;
}

function chooseFive(cards: string[]) {
  const combinations: string[][] = [];

  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            combinations.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
          }
        }
      }
    }
  }

  return combinations;
}

function parseCard(card: string): ParsedCard {
  const match = card.match(/^(10|[2-9JQKA])([SHDC])$/);
  if (!match) {
    throw new Error(`Invalid card format: ${card}`);
  }

  return {
    card,
    rank: rankValue(match[1]),
    suit: match[2],
  };
}

function rankValue(rank: string) {
  switch (rank) {
    case "A":
      return 14;
    case "K":
      return 13;
    case "Q":
      return 12;
    case "J":
      return 11;
    default:
      return Number(rank);
  }
}

function getRankGroups(cards: ParsedCard[]) {
  const grouped = new Map<number, ParsedCard[]>();

  for (const card of cards) {
    const existing = grouped.get(card.rank) ?? [];
    existing.push(card);
    grouped.set(card.rank, existing);
  }

  return [...grouped.values()].sort((left, right) => {
    if (right.length !== left.length) {
      return right.length - left.length;
    }

    return right[0].rank - left[0].rank;
  });
}

function getStraightHigh(cards: ParsedCard[]) {
  const uniqueRanks = [...new Set(cards.map((card) => card.rank))].sort((left, right) => right - left);

  if (uniqueRanks.length !== 5) {
    return null;
  }

  const regularStraight = uniqueRanks.every((rank, index) =>
    index === 0 ? true : uniqueRanks[index - 1] - rank === 1
  );

  if (regularStraight) {
    return uniqueRanks[0];
  }

  const wheel = [14, 5, 4, 3, 2];
  return wheel.every((rank, index) => uniqueRanks[index] === rank) ? 5 : null;
}

function sortCards(cards: ParsedCard[]) {
  return [...cards].sort((left, right) => {
    if (right.rank !== left.rank) {
      return right.rank - left.rank;
    }

    return right.suit.localeCompare(left.suit);
  });
}

function sortStraightCards(cards: ParsedCard[], straightHigh: number) {
  if (straightHigh === 5) {
    const wheelOrder = new Map([
      [5, 5],
      [4, 4],
      [3, 3],
      [2, 2],
      [14, 1],
    ]);

    return [...cards].sort(
      (left, right) => (wheelOrder.get(right.rank) ?? 0) - (wheelOrder.get(left.rank) ?? 0)
    );
  }

  return sortCards(cards);
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
