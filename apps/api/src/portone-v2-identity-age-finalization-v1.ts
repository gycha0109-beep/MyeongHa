import type {
  PortOneV2IdentityAgeBandV1,
  PortOneV2IdentityOwnedAttemptV1,
} from './portone-v2-identity-verification-contract-v1.js';
import type {
  PortOneV2IdentityLookupAdapterV1,
} from './portone-v2-identity-verification-lookup-v1.js';

/**
 * Future server-only orchestration contract. The persistence port is
 * intentionally NOT implemented here: DB / subject and retention authorities
 * must be provided by their respective tracks before an endpoint goes live.
 */
export interface PortOneV2IdentityAgeAuthorityPortV1 {
  /**
   * Reads a server-issued, unexpired attempt linked to the authenticated
   * canonical subject. Never trust a browser-provided Subject identifier.
   */
  readPendingOwnedAttempt(input: Readonly<{
    subjectId: string;
    identityVerificationId: string;
  }>): Promise<PortOneV2IdentityOwnedAttemptV1 | null>;

  /**
   * Must atomically compare expected pending ID+owner+TTL, mark it consumed
   * and persist only the minimal verified age band. Return false on a replay
   * or revoked/expired attempt. Never allow a caller to grant outside this step.
   */
  consumeAndRecordAgeBand(input: Readonly<{
    subjectId: string;
    identityVerificationId: string;
    ageBand: PortOneV2IdentityAgeBandV1;
    serverTime: string;
  }>): Promise<boolean>;
}

export type PortOneV2IdentityAgeFinalizationResultV1 =
  | Readonly<{ kind: 'granted'; ageBand: PortOneV2IdentityAgeBandV1 }>
  | Readonly<{ kind: 'held'; reason: 'ATTEMPT_NOT_OWNED' | 'INVALID_AGE_PROOF' | 'ALREADY_USED' }>;

/** Orchestrates only an injected, subject-scoped lookup and atomic commit. */
export async function finalizePortOneV2IdentityAgeV1(input: Readonly<{
  subjectId: string;
  identityVerificationId: string;
  serverTime: string;
  authority: PortOneV2IdentityAgeAuthorityPortV1;
  lookup: PortOneV2IdentityLookupAdapterV1;
}>): Promise<PortOneV2IdentityAgeFinalizationResultV1> {
  if (
    !input ||
    typeof input.subjectId !== 'string' || !input.subjectId ||
    typeof input.identityVerificationId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(input.identityVerificationId)
  ) {
    return Object.freeze({ kind: 'held', reason: 'ATTEMPT_NOT_OWNED' });
  }
  const ownedAttempt = await input.authority.readPendingOwnedAttempt({
    subjectId: input.subjectId, identityVerificationId: input.identityVerificationId,
  });
  if (
    ownedAttempt === null ||
    ownedAttempt.subjectId !== input.subjectId ||
    ownedAttempt.identityVerificationId !== input.identityVerificationId ||
    ownedAttempt.status !== 'pending'
  ) {
    return Object.freeze({ kind: 'held', reason: 'ATTEMPT_NOT_OWNED' });
  }

  const decision = await input.lookup.verify({
    subjectId: input.subjectId,
    identityVerificationId: input.identityVerificationId,
    ownedAttempt,
    serverTime: input.serverTime,
  });
  if (decision.kind !== 'verified') {
    return Object.freeze({ kind: 'held', reason: 'INVALID_AGE_PROOF' });
  }
  if (
    decision.subjectId !== input.subjectId ||
    decision.identityVerificationId !== input.identityVerificationId ||
    (decision.ageBand !== 'adult' && decision.ageBand !== 'free_minor')
  ) {
    return Object.freeze({ kind: 'held', reason: 'INVALID_AGE_PROOF' });
  }

  const recorded = await input.authority.consumeAndRecordAgeBand({
    subjectId: input.subjectId,
    identityVerificationId: input.identityVerificationId,
    ageBand: decision.ageBand,
    serverTime: input.serverTime,
  });
  return recorded
    ? Object.freeze({ kind: 'granted', ageBand: decision.ageBand })
    : Object.freeze({ kind: 'held', reason: 'ALREADY_USED' });
}
