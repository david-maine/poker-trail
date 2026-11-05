import type { LocalCardClaim, LocalHand } from "./localHand";

export function pendingClaimCount(hand: LocalHand) {
  const acknowledged = new Set(hand.acknowledgedWaypointIds);
  return hand.claims.filter(claim => !acknowledged.has(claim.waypointId)).length;
}

export function sameClaim(a: LocalCardClaim, b: LocalCardClaim) {
  return a.waypointId === b.waypointId && a.card === b.card && a.claimedAt === b.claimedAt &&
    a.claimedLat === b.claimedLat && a.claimedLng === b.claimedLng && a.gpsAccuracyMeters === b.gpsAccuracyMeters;
}

export function reconcileAcceptedHand(hand: LocalHand, accepted: LocalCardClaim[], completed: boolean, finishedAt: string | null): LocalHand {
  const claims = new Map(hand.claims.map(claim => [claim.waypointId, claim]));
  for (const claim of accepted) {
    const local = claims.get(claim.waypointId);
    if (local && !sameClaim(local, claim)) {
      throw new Error("A card on this device conflicts with an accepted card. Your local cards have been kept; contact the event organiser.");
    }
    if ([...claims.values()].some(other => other.card === claim.card && other.waypointId !== claim.waypointId)) {
      throw new Error("A local card conflicts with progress from another device. Your cards have been kept; contact the event organiser.");
    }
    claims.set(claim.waypointId, claim);
  }
  const acknowledged = new Set([...hand.acknowledgedWaypointIds, ...accepted.map(claim => claim.waypointId)]);
  return {
    ...hand,
    claims: [...claims.values()].sort((a, b) => a.claimedAt.localeCompare(b.claimedAt)),
    acknowledgedWaypointIds: [...acknowledged],
    rejectedWaypointIds: hand.rejectedWaypointIds?.filter(id => !acknowledged.has(id)),
    status: completed ? "submitted" : "collecting",
    submittedAt: completed ? finishedAt ?? hand.submittedAt : null,
    lastSubmissionError: null,
    lastSubmissionRetryable: false,
    submissionAttemptCount: 0,
    updatedAt: new Date().toISOString(),
  };
}
