import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  createSajuHeldSourceProofHttpIssuePortV1,
  type SajuHeldSourceProofHttpClientOptionsV1,
} from './saju-held-source-proof-http-client-v1.js';
import type { SajuHeldSourceProofIssuePortV1 } from './saju-held-source-proof-revision-binding-v1.js';
import type { SajuHeldSourceProofVerifierTrustV1 } from './saju-held-source-proof-verifier-v1.js';
import {
  createSajuSourceProofPostgresNonceClaimV1,
} from './saju-source-proof-nonce-postgres-claim-v1.js';

export const SAJU_HELD_SOURCE_PROOF_SERVER_TRUST_VERSION_V1 =
  'myeongha-held-source-proof-server-trust-v1' as const;

const PROOF_ID = /^[A-Za-z0-9._:-]{3,128}$/u;

export interface SajuHeldSourceProofServerTrustOptionsV1 {
  /** All values are server-owned, never parsed from an incoming web request. */
  readonly serviceOrigin: string;
  readonly serviceBearer: string;
  readonly trustedIssuer: string;
  readonly expectedAudience: string;
  readonly trustedKeyId: string;
  /** Signing/verification secret distinct from the service authentication bearer. */
  readonly keyBytes: Uint8Array;
  /** Privileged, independently provisioned server-only pool; NOT a browser pool. */
  readonly noncePool: PostgresSubjectPoolV1;
  readonly timeoutMs?: number;
  /** Deterministic synthetic test seams, not sources of runtime authority. */
  readonly fetchImpl?: SajuHeldSourceProofHttpClientOptionsV1['fetchImpl'];
  readonly nonceNowMsFactory?: () => number;
}

export type SajuHeldSourceProofServerTrustPortsV1 = Readonly<{
  version: typeof SAJU_HELD_SOURCE_PROOF_SERVER_TRUST_VERSION_V1;
  issuePort: SajuHeldSourceProofIssuePortV1;
  verifierTrust: SajuHeldSourceProofVerifierTrustV1;
}>;

/**
 * Explicit, server-only dependency assembly: protected issuer transport +
 * independently configured HMAC trust + PostgreSQL cross-replica nonce claim.
 *
 * No process-local replay fallback, no public route, no environment resolver,
 * no Production Reading or Commerce authority. This module never opens a
 * connection or sends a request during construction.
 */
export function createSajuHeldSourceProofServerTrustV1(
  options: SajuHeldSourceProofServerTrustOptionsV1,
): SajuHeldSourceProofServerTrustPortsV1 {
  if (!options || !PROOF_ID.test(options.trustedIssuer)
    || !PROOF_ID.test(options.expectedAudience)
    || !PROOF_ID.test(options.trustedKeyId)
    || !(options.keyBytes instanceof Uint8Array)
    || options.keyBytes.byteLength < 32
    || !options.noncePool || typeof options.noncePool.connect !== 'function') {
    throw new TypeError('Invalid protected Saju source proof trust configuration.');
  }

  // Isolate verifier key material from any subsequent caller mutation.
  const verifierKeyBytes = Uint8Array.from(options.keyBytes);
  const issuePort = createSajuHeldSourceProofHttpIssuePortV1({
    serviceOrigin: options.serviceOrigin,
    serviceBearer: options.serviceBearer,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  });
  const claimNonceOnce = createSajuSourceProofPostgresNonceClaimV1({
    pool: options.noncePool,
    ...(options.nonceNowMsFactory === undefined
      ? {} : { nowMsFactory: options.nonceNowMsFactory }),
  });

  const verifierTrust: SajuHeldSourceProofVerifierTrustV1 = Object.freeze({
    trustedIssuer: options.trustedIssuer,
    expectedAudience: options.expectedAudience,
    trustedKeyId: options.trustedKeyId,
    keyBytes: verifierKeyBytes,
    claimNonceOnce,
  });
  return Object.freeze({
    version: SAJU_HELD_SOURCE_PROOF_SERVER_TRUST_VERSION_V1,
    issuePort,
    verifierTrust,
  });
}
