import { createHash } from 'node:crypto';
import {
  parseSajuHeldStagingAuthorityRegistryV1,
  canonicalSajuHeldStagingAuthorityRegistryBytesV1,
} from './saju-held-staging-authority-registry-v1.js';
import {
  assessSajuHeldStagingRootPinPreflightV1,
  parseSajuHeldStagingRootPinSnapshotV1,
  type SajuHeldStagingRootPinSnapshotV1,
} from './saju-held-staging-root-pin-preflight-v1.js';

/**
 * SO-2 is an unconnected adapter contract. Providers are injected by trusted
 * application composition after separately reviewed identity/IAM/provenance.
 * Calling this function alone NEVER verifies an operational custodian.
 */
export const SAJU_SOLO_OWNER_REGISTRY_FLOOR_VERSION_V1 =
  'myeongha-saju-solo-owner-registry-floor-v1' as const;
const ENV = /^myeongha-staging-[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/u;
const HEX64 = /^[a-f0-9]{64}$/u;

export interface SajuSoloOwnerSignedRegistryCandidateV1 {
  readonly registry: unknown;
  readonly detachedSignature: unknown;
  readonly candidateRootSpkiBase64url: unknown;
  /** Target chosen by separately reviewed server composition, NEVER request body. */
  readonly expectedEnvironmentId: string;
}

export type SajuSoloOwnerVerifiedRegistryFloorClaimV1 = Readonly<{
  readonly environmentId: string;
  readonly rootKeyId: string;
  readonly rootSpkiSha256: string;
  readonly expectedMinimumRevision: number;
  readonly candidateRevision: number;
  readonly registryDigestSha256: string;
}>;

export type SajuSoloOwnerRegistryFloorWriteAckV1 =
  | Readonly<{ status: 'ACK'; minimumRevision: number; rootKeyId: string;
    rootSpkiSha256: string; environmentId: string; registryDigestSha256: string }>
  | Readonly<{ status: 'REJECTED' | 'REVOKED' | 'UNKNOWN' }>;

/**
 * Never implement this port with a caller-supplied snapshot or general API
 * identity. A production adapter MUST atomically check pinned identity,
 * revocation, revision floor and durable write, then return a confirmed ACK.
 * The synthetic contract cannot establish that the port is trustworthy.
 */
export interface SajuSoloOwnerRegistryFloorPortV1 {
  readPinnedSnapshot(environmentId: string): Promise<unknown>;
  readTrustedTimeMs(): Promise<unknown>;
  commitVerifiedRegistryClaim(
    claim: SajuSoloOwnerVerifiedRegistryFloorClaimV1,
  ): Promise<SajuSoloOwnerRegistryFloorWriteAckV1>;
}

type CodeV1 = 'CHECKED_UNVERIFIED_CUSTODY' | 'INVALID_TARGET'
  | 'UNAVAILABLE_OR_UNTRUSTED_SNAPSHOT' | 'UNTRUSTED_CLOCK'
  | 'SIGNATURE_PIN_FLOOR_MISMATCH' | 'ATOMIC_ACK_MISSING_OR_AMBIGUOUS';

export type SajuSoloOwnerRegistryFloorResultV1 = Readonly<{
  version: typeof SAJU_SOLO_OWNER_REGISTRY_FLOOR_VERSION_V1;
  state: 'SIGNED_CLAIM_WRITE_ACK_UNVERIFIED_CUSTODY' | 'HOLD';
  reason: CodeV1;
  custodyAuthority: 'NOT_VERIFIED';
  registryStorageDurability: 'NOT_VERIFIED';
  signerAuthority: 'NOT_VERIFIED';
  operationalEvidence: 'NOT_VERIFIED';
  stagingAdmission: 'HOLD';
  canRunOnce: false;
  canExecute: false;
  canPublish: false;
  canSell: false;
}>;

function finish(
  state: SajuSoloOwnerRegistryFloorResultV1['state'],
  reason: CodeV1,
): SajuSoloOwnerRegistryFloorResultV1 {
  return Object.freeze({
    version: SAJU_SOLO_OWNER_REGISTRY_FLOOR_VERSION_V1,
    state,reason,
    custodyAuthority:'NOT_VERIFIED' as const,
    registryStorageDurability:'NOT_VERIFIED' as const,
    signerAuthority:'NOT_VERIFIED' as const,
    operationalEvidence:'NOT_VERIFIED' as const,
    stagingAdmission:'HOLD' as const,
    canRunOnce:false as const,
    canExecute:false as const,
    canPublish:false as const,
    canSell:false as const,
  });
}

/**
 * A signed Registry must pass SPKI/fingerprint/root ID/environment/floor/time
 * before the only ledger update is attempted. The port must enforce atomic
 * equality of its own CURRENT pin/floor, not blindly trust this stale read.
 */
export async function assessSajuSoloOwnerRegistryFloorV1(
  port: SajuSoloOwnerRegistryFloorPortV1,
  candidate: SajuSoloOwnerSignedRegistryCandidateV1,
): Promise<SajuSoloOwnerRegistryFloorResultV1> {
  try {
    if (!candidate || typeof candidate.expectedEnvironmentId !== 'string'
      || !ENV.test(candidate.expectedEnvironmentId)) return finish('HOLD','INVALID_TARGET');
    let snapshot: Readonly<SajuHeldStagingRootPinSnapshotV1>;
    try {
      snapshot = parseSajuHeldStagingRootPinSnapshotV1(
        await port.readPinnedSnapshot(candidate.expectedEnvironmentId),
      );
      if (snapshot.environmentId !== candidate.expectedEnvironmentId) {
        return finish('HOLD','UNAVAILABLE_OR_UNTRUSTED_SNAPSHOT');
      }
    } catch { return finish('HOLD','UNAVAILABLE_OR_UNTRUSTED_SNAPSHOT'); }

    let nowMs: number;
    try {
      const clock: unknown = await port.readTrustedTimeMs();
      if (typeof clock !== 'number' || !Number.isSafeInteger(clock)
        || clock < 0) return finish('HOLD','UNTRUSTED_CLOCK');
      nowMs = clock;
    } catch { return finish('HOLD','UNTRUSTED_CLOCK'); }

    const proof = assessSajuHeldStagingRootPinPreflightV1({
      custodySnapshot:snapshot,
      candidateRootSpkiBase64url:candidate.candidateRootSpkiBase64url,
      registry:candidate.registry,
      registrySignature:candidate.detachedSignature,
      nowMs,
    });
    if (proof.contract !== 'PINNED_SIGNED_CLAIM_UNVERIFIED_CUSTODY') {
      return finish('HOLD','SIGNATURE_PIN_FLOOR_MISMATCH');
    }
    const registry = parseSajuHeldStagingAuthorityRegistryV1(candidate.registry);
    if (registry.environmentId !== candidate.expectedEnvironmentId
      || registry.rootKeyId !== snapshot.rootKeyId
      || registry.revision < snapshot.minimumRegistryRevision) {
      return finish('HOLD','SIGNATURE_PIN_FLOOR_MISMATCH');
    }

    const digest = createHash('sha256')
      .update(canonicalSajuHeldStagingAuthorityRegistryBytesV1(registry))
      .digest('hex');
    const claim = Object.freeze({
      environmentId:snapshot.environmentId,
      rootKeyId:snapshot.rootKeyId,
      rootSpkiSha256:snapshot.rootSpkiSha256,
      expectedMinimumRevision:snapshot.minimumRegistryRevision,
      candidateRevision:registry.revision,
      registryDigestSha256:digest,
    });
    // Neither an exception nor a lost COMMIT response authorizes retry.
    const ack: unknown = await port.commitVerifiedRegistryClaim(claim);
    if (!ack || typeof ack !== 'object' || Array.isArray(ack)) {
      return finish('HOLD','ATOMIC_ACK_MISSING_OR_AMBIGUOUS');
    }
    const response = ack as Record<string, unknown>;
    if (response.status !== 'ACK'
      || response.environmentId !== claim.environmentId
      || response.rootKeyId !== claim.rootKeyId
      || response.rootSpkiSha256 !== claim.rootSpkiSha256
      || response.registryDigestSha256 !== claim.registryDigestSha256
      || response.minimumRevision !== claim.candidateRevision
      || typeof response.registryDigestSha256 !== 'string'
      || !HEX64.test(response.registryDigestSha256)) {
      return finish('HOLD','ATOMIC_ACK_MISSING_OR_AMBIGUOUS');
    }
    return finish('SIGNED_CLAIM_WRITE_ACK_UNVERIFIED_CUSTODY',
      'CHECKED_UNVERIFIED_CUSTODY');
  } catch {
    return finish('HOLD','ATOMIC_ACK_MISSING_OR_AMBIGUOUS');
  }
}
