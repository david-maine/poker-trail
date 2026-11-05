import { reconcileAcceptedHand } from "./handSyncState";
import { drawCard, isValidCard } from "./cards";
import { getSafeStorage } from "./safeStorage";

const HAND_STORAGE_PREFIX = "poker-trail:local-hand:v1:";

export type LocalHandStatus = "collecting" | "pending_submission" | "submitted";

export type LocalCardClaim = {
  waypointId: string;
  card: string;
  claimedAt: string;
  claimedLat: number;
  claimedLng: number;
  gpsAccuracyMeters: number | null;
};

export type LocalHand = {
  eventId: string;
  claims: LocalCardClaim[];
  acknowledgedWaypointIds: string[];
  rejectedWaypointIds?: string[];
  status: LocalHandStatus;
  submittedAt: string | null;
  submissionAttemptCount: number;
  lastSubmissionError: string | null;
  lastSubmissionRetryable: boolean;
  updatedAt: string;
};

type ClaimInput = {
  eventId: string;
  waypointId: string;
  claimedLat: number;
  claimedLng: number;
  gpsAccuracyMeters: number | null;
};

type LocalHandChangeListener = (hand: LocalHand) => void;

const localHandChangeListeners = new Set<LocalHandChangeListener>();

export function subscribeToLocalHandChanges(listener: LocalHandChangeListener) {
  localHandChangeListeners.add(listener);

  return () => {
    localHandChangeListeners.delete(listener);
  };
}

export async function getLocalHand(eventId: string): Promise<LocalHand> {
  const rawValue = await getSafeStorage().getItem(getHandStorageKey(eventId));

  if (!rawValue) {
    return createEmptyHand(eventId);
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (isLocalHand(parsed) && parsed.eventId === eventId) {
      return {
        ...parsed,
        acknowledgedWaypointIds: parsed.acknowledgedWaypointIds ?? (parsed.status === "submitted" ? parsed.claims.map(c => c.waypointId) : []),
        lastSubmissionRetryable: parsed.lastSubmissionRetryable ?? false,
        claims: parsed.claims.sort(compareClaims),
      };
    }
  } catch {
    // Fall through to an empty local hand.
  }

  return createEmptyHand(eventId);
}

export async function addLocalCardClaim(input: ClaimInput) {
  return withHandLock(input.eventId, () => collectCard(input));
}

async function collectCard(input: ClaimInput) {
  const hand = await getLocalHand(input.eventId);
  const existingClaim = hand.claims.find((claim) => claim.waypointId === input.waypointId);

  if (existingClaim) {
    // An unaccepted card may be re-proved after a waypoint was edited. Keep its
    // value; only replace the rejected GPS proof, never an accepted claim.
    if (hand.status !== "submitted" && hand.rejectedWaypointIds?.includes(input.waypointId) &&
        !hand.acknowledgedWaypointIds.includes(input.waypointId)) {
      const claim = { ...existingClaim, claimedAt: new Date().toISOString(),
        claimedLat: input.claimedLat, claimedLng: input.claimedLng, gpsAccuracyMeters: input.gpsAccuracyMeters };
      const next = { ...hand, claims: hand.claims.map(current => current.waypointId === claim.waypointId ? claim : current),
        rejectedWaypointIds: hand.rejectedWaypointIds.filter(id => id !== input.waypointId),
        lastSubmissionError: null, lastSubmissionRetryable: false, updatedAt: new Date().toISOString() };
      await saveLocalHand(next);
      return { hand: next, claim, added: false };
    }
    return {
      hand,
      claim: existingClaim,
      added: false,
    };
  }

  if (hand.status === "submitted") {
    throw new Error("This hand has already been submitted.");
  }

  const now = new Date().toISOString();
  const claim: LocalCardClaim = {
    waypointId: input.waypointId,
    card: drawCard(hand.claims.map((currentClaim) => currentClaim.card)),
    claimedAt: now,
    claimedLat: input.claimedLat,
    claimedLng: input.claimedLng,
    gpsAccuracyMeters: input.gpsAccuracyMeters,
  };

  const nextHand: LocalHand = {
    ...hand,
    claims: [...hand.claims, claim].sort(compareClaims),
    status: hand.status === "pending_submission" ? "pending_submission" : "collecting",
    lastSubmissionError: null,
    lastSubmissionRetryable: false,
    updatedAt: now,
  };

  await saveLocalHand(nextHand);

  return {
    hand: nextHand,
    claim,
    added: true,
  };
}

// Read the latest hand inside the lock: an upload may finish after another card is collected.
export async function acknowledgeHand(eventId: string, accepted: LocalCardClaim[], completed: boolean, finishedAt: string | null) {
  return withHandLock(eventId, async () => {
    const hand = await getLocalHand(eventId);
    const next = reconcileAcceptedHand(hand, accepted, completed, finishedAt);
    await saveLocalHand(next);
    return next;
  });
}

export async function recordSyncFailure(eventId: string, message: string, retryable: boolean, rejectedWaypointIds?: string[]) {
  return withHandLock(eventId, async () => {
    const hand = await getLocalHand(eventId);
    const next = { ...hand, lastSubmissionError: message, lastSubmissionRetryable: retryable,
      rejectedWaypointIds: rejectedWaypointIds ?? hand.rejectedWaypointIds,
      submissionAttemptCount: hand.submissionAttemptCount + 1 };
    await saveLocalHand(next);
    return next;
  });
}

const handLocks = new Map<string, Promise<unknown>>();
function withHandLock<T>(eventId: string, action: () => Promise<T>): Promise<T> {
  const previous = handLocks.get(eventId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(action);
  handLocks.set(eventId, next);
  void next.finally(() => { if (handLocks.get(eventId) === next) handLocks.delete(eventId); }).catch(() => {});
  return next;
}

export async function saveLocalHand(hand: LocalHand) {
  await getSafeStorage().setItem(getHandStorageKey(hand.eventId), JSON.stringify(hand));
  notifyLocalHandChanged(hand);
}

function notifyLocalHandChanged(hand: LocalHand) {
  for (const listener of localHandChangeListeners) {
    try {
      listener(hand);
    } catch (error) {
      console.error("Local hand change listener failed", error);
    }
  }
}

function createEmptyHand(eventId: string): LocalHand {
  return {
    eventId,
    claims: [],
    acknowledgedWaypointIds: [],
    status: "collecting",
    submittedAt: null,
    submissionAttemptCount: 0,
    lastSubmissionError: null,
    lastSubmissionRetryable: false,
    updatedAt: new Date().toISOString(),
  };
}

function getHandStorageKey(eventId: string) {
  return `${HAND_STORAGE_PREFIX}${eventId}`;
}

function compareClaims(left: LocalCardClaim, right: LocalCardClaim) {
  return left.claimedAt.localeCompare(right.claimedAt);
}

function isLocalHand(value: unknown): value is LocalHand {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LocalHand>;
  return (
    typeof candidate.eventId === "string" &&
    Array.isArray(candidate.claims) &&
    candidate.claims.every(isLocalCardClaim) &&
    (candidate.status === "collecting" ||
      candidate.status === "pending_submission" ||
      candidate.status === "submitted") &&
    (typeof candidate.submittedAt === "string" || candidate.submittedAt === null) &&
    typeof candidate.submissionAttemptCount === "number" &&
    (typeof candidate.lastSubmissionError === "string" || candidate.lastSubmissionError === null) &&
    (typeof candidate.lastSubmissionRetryable === "boolean" ||
      candidate.lastSubmissionRetryable === undefined) &&
    typeof candidate.updatedAt === "string"
  );
}

function isLocalCardClaim(value: unknown): value is LocalCardClaim {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LocalCardClaim>;
  return (
    typeof candidate.waypointId === "string" &&
    typeof candidate.card === "string" &&
    isValidCard(candidate.card) &&
    typeof candidate.claimedAt === "string" &&
    typeof candidate.claimedLat === "number" &&
    typeof candidate.claimedLng === "number" &&
    (typeof candidate.gpsAccuracyMeters === "number" || candidate.gpsAccuracyMeters === null)
  );
}
