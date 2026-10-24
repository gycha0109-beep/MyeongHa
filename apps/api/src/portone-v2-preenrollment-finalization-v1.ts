import type { PortOneV2IdentityLookupAdapterV1 } from './portone-v2-identity-verification-lookup-v1.js';
import type { PortOnePreenrollmentAgeBandV1 } from './portone-v2-preenrollment-age-authority-v1.js';

const ATTEMPT = /^iv[a-f0-9]{32}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;

export interface PortOnePreenrollmentAuthorityPortV1 {
  readPending(bindingDigest: string, id: string): Promise<boolean>;
  recordVerified(bindingDigest: string, id: string, band: PortOnePreenrollmentAgeBandV1): Promise<boolean>;
}

export type PortOnePreenrollmentVerificationResultV1 =
  | Readonly<{ kind: 'verified'; ageBand: PortOnePreenrollmentAgeBandV1 }>
  | Readonly<{ kind: 'held' }>;

/**
 * The existing PortOne GET and response validation are reused with a
 * deliberately synthetic opaque "subject key". That key is NEVER a MyeongHa
 * Subject, carries no identity material and cannot create a service account.
 * Only the separately reviewed pre-enrollment SQL can accept this actor.
 */
export async function finalizePortOneV2PreenrollmentAgeV1(input: Readonly<{
  bindingDigest: string;
  identityVerificationId: string;
  serverTime: string;
  authority: PortOnePreenrollmentAuthorityPortV1;
  providerLookup: Pick<PortOneV2IdentityLookupAdapterV1, 'verify'>;
}>): Promise<PortOnePreenrollmentVerificationResultV1> {
  const { bindingDigest, identityVerificationId } = input;
  if (!DIGEST.test(bindingDigest) || !ATTEMPT.test(identityVerificationId) ||
      !Number.isFinite(Date.parse(input.serverTime))) {
    return Object.freeze({ kind: 'held' });
  }

  // A browser-reported success does not authorize this operation. The
  // database must identify the same unexpired, still-pending cookie-bound ID.
  if (!await input.authority.readPending(bindingDigest, identityVerificationId)) {
    return Object.freeze({ kind: 'held' });
  }

  const decision = await input.providerLookup.verify({
    subjectId: bindingDigest,
    identityVerificationId,
    ownedAttempt: Object.freeze({
      subjectId: bindingDigest, identityVerificationId, status: 'pending' as const,
    }),
    serverTime: input.serverTime,
  });

  if (decision.kind !== 'verified' || decision.subjectId !== bindingDigest ||
      decision.identityVerificationId !== identityVerificationId) {
    return Object.freeze({ kind: 'held' });
  }
  if (decision.ageBand !== 'adult' && decision.ageBand !== 'free_minor') {
    return Object.freeze({ kind: 'held' });
  }

  // Race/replay/expiry is adjudicated at the same guarded SQL transition.
  return await input.authority.recordVerified(
    bindingDigest, identityVerificationId, decision.ageBand,
  )
    ? Object.freeze({ kind: 'verified', ageBand: decision.ageBand })
    : Object.freeze({ kind: 'held' });
}
