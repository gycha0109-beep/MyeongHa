// Phase 4C-3: deterministic, READ-ONLY evidence classification for disposable
// Docker tests. No DB connection, retry, compensating write or Runner wiring.
// Independent PostgreSQL snapshots are NOT a distributed atomic transaction.
export const SAJU_BRIDGE_CROSS_DB_OBSERVATION_VERSION_V1 =
  'myeongha-saju-cross-db-observation-hold-v1';

export function classifySajuBridgeCrossDbObservationV1(evidence) {
  const subject = evidence?.subject;
  const nonce = evidence?.nonce;
  const permit = evidence?.permit;
  let classification = 'UNKNOWN_HOLD';
  if (subject === 'PRESENT'
    && ['CLAIMED', 'ABSENT'].includes(nonce)
    && ['ISSUED', 'CONSUMED', 'REVOKED', 'MISSING'].includes(permit)) {
    if (nonce === 'CLAIMED' && permit === 'ISSUED') classification = 'NONCE_ONLY_HOLD';
    else if (nonce === 'ABSENT' && permit === 'CONSUMED') classification = 'PERMIT_ONLY_HOLD';
    else if (nonce === 'CLAIMED' && permit === 'REVOKED') classification = 'REVOKED_WITH_NONCE_HOLD';
    else if (nonce === 'CLAIMED' && permit === 'CONSUMED') classification = 'BOTH_DURABLE_UNVERIFIED_HOLD';
    else if (nonce === 'ABSENT' && permit === 'ISSUED') classification = 'NEITHER_DURABLE_HOLD';
    else if (nonce === 'ABSENT' && permit === 'REVOKED') classification = 'REVOKED_ONLY_HOLD';
    else classification = 'MISSING_PERMIT_HOLD';
  } else if (subject === 'MISSING' && ['CLAIMED', 'ABSENT'].includes(nonce)
    && ['ISSUED', 'CONSUMED', 'REVOKED', 'MISSING'].includes(permit)) {
    classification = 'SUBJECT_MISSING_HOLD';
  }
  // Unknown/unavailable peer, malformed record or inconsistent evidence is
  // intentionally indistinguishable from unresolved distributed uncertainty.
  return Object.freeze({
    version: SAJU_BRIDGE_CROSS_DB_OBSERVATION_VERSION_V1,
    classification,
    decision: 'HOLD_MANUAL_REVIEW',
    canExecute: false, canPublish: false, canSell: false,
    automaticRetry: false, automaticCompensation: false,
  });
}


// Phase 4D: compare two *independently observed* read-only snapshots.
// This only detects a change, never proves atomicity, temporal stability,
// source authority or a safe recovery plan. No DB/Runner adapter is exposed.
export function assessSajuBridgeCrossDbSnapshotRaceV1(before, after) {
  const ids = ['NONCE_ONLY', 'PERMIT_ONLY', 'REVOKED_WITH_NONCE'];
  const shape = snapshot => snapshot !== null && typeof snapshot === 'object'
    && !Array.isArray(snapshot)
    && Object.keys(snapshot).length === ids.length
    && ids.every(id => {
      const value = snapshot[id];
      if (value === null || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).length !== 3) return false;
      return ['subject', 'nonce', 'permit'].every(k => Object.hasOwn(value, k))
        && classifySajuBridgeCrossDbObservationV1(value).classification !== 'UNKNOWN_HOLD';
    });
  const known = shape(before) && shape(after);
  const changed = known && ids.some(id =>
    ['subject', 'nonce', 'permit'].some(k => before[id][k] !== after[id][k]));
  return Object.freeze({
    version: 'myeongha-saju-cross-db-snapshot-race-hold-v1',
    classification: !known ? 'UNKNOWN_HOLD'
      : changed ? 'EVIDENCE_CHANGED_HOLD' : 'UNCHANGED_UNVERIFIED_HOLD',
    decision: 'HOLD_MANUAL_REVIEW',
    canExecute: false, canPublish: false, canSell: false,
    automaticRetry: false, automaticCompensation: false,
  });
}
