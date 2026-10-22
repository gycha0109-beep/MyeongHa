import { projectProductReadingResponseV2 } from '../../../packages/api-client/src/product-reading-display.js';
import type { PreparedOfficialReadingReaderAdmissionV1 } from './official-reading-reader-admission-v1.js';
import type { OfficialReadingRecordV1 } from './official-reading-record-read.js';
import {
  preflightSajuNativeDbReadingIdentityGapV1,
} from './saju-native-db-reading-identity-gap-v1.js';
import { hashSajuHeldSourceProofRequestV1 } from './saju-held-source-proof-verifier-v1.js';

/**
 * Owner handoff, not an ID translator.
 *
 * Saju's native ProductReadingResponse v2 may carry its own Reading ID,
 * whereas MyeongHa DB owns a separate Official Reading UUID. This contract
 * checks whether the ENTIRE v2 payload would be unchanged if that ONE
 * identifier were represented by the DB UUID. No response is rewritten,
 * stored, exported or granted to a Reader by this function.
 */
export const SAJU_DB_ID_ONLY_RESPONSE_PARITY_VERSION_V1 =
  'saju-db-reading-id-only-response-parity-v1' as const;

export type SajuDbIdOnlyResponseParityV1 = Readonly<{
  contractVersion: typeof SAJU_DB_ID_ONLY_RESPONSE_PARITY_VERSION_V1;
  state: 'held' | 'blocked';
  reason: 'only_reading_id_payload_change_unattested' | 'source_or_non_id_payload_change';
  sourceAuthority: 'NOT_EVALUATED';
  mappingAuthority: 'NOT_EVALUATED';
  currentAccessAuthority: 'NOT_EVALUATED';
  s5AtomicStorage: 'DB_OWNER_REQUIRED';
  s7Delivery: 'DB_OWNER_REQUIRED';
  canMapReadingId: false;
  canPersist: false;
  canDisclose: false;
  canPublish: false;
  canSell: false;
}>;

function decision(consistent: boolean): SajuDbIdOnlyResponseParityV1 {
  return Object.freeze({
    contractVersion: SAJU_DB_ID_ONLY_RESPONSE_PARITY_VERSION_V1,
    state: consistent ? 'held' as const : 'blocked' as const,
    reason: consistent
      ? 'only_reading_id_payload_change_unattested' as const
      : 'source_or_non_id_payload_change' as const,
    sourceAuthority: 'NOT_EVALUATED' as const,
    mappingAuthority: 'NOT_EVALUATED' as const,
    currentAccessAuthority: 'NOT_EVALUATED' as const,
    s5AtomicStorage: 'DB_OWNER_REQUIRED' as const,
    s7Delivery: 'DB_OWNER_REQUIRED' as const,
    canMapReadingId: false as const,
    canPersist: false as const,
    canDisclose: false as const,
    canPublish: false as const,
    canSell: false as const,
  });
}
const BLOCKED = decision(false);

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Compare the ACTUAL in-process Saju response with the separately authorized
 * DB Reader/Records response, never a synthetic response rebuilt from source
 * text hashes. The original Saju response MUST be obtained from a trusted
 * server-only source hop, never from a browser or private chat.
 *
 * This proves content-differential equality only. It does NOT prove the
 * original Saju response actually came from a Production issuer: the
 * authentic issuer signature, normalized request/birth-revision binding,
 * DB mapping transformation receipt, current Reader Grant and Privacy
 * release are exclusively owned by their existing Saju/DB/Privacy tracks.
 */
export function inspectSajuDbReadingIdOnlyResponseParityV1(input: Readonly<{
  readerAdmission: PreparedOfficialReadingReaderAdmissionV1;
  record: OfficialReadingRecordV1;
  sajuHandoff: unknown;
  /** Exact native Saju ProductReadingResponse v2, server-only, immutable. */
  nativeSajuResponse: unknown;
}>): SajuDbIdOnlyResponseParityV1 {
  try {
    const gap = preflightSajuNativeDbReadingIdentityGapV1(input);
    if (gap.state !== 'held' || gap.canMapReadingId !== false
      || gap.sourceAuthority !== 'NOT_EVALUATED'
      || !object(input.sajuHandoff) || !object(input.sajuHandoff.source)
      || !object(input.nativeSajuResponse)) return BLOCKED;

    const handoffSource = input.sajuHandoff.source;
    const native = input.nativeSajuResponse;
    const dbSnapshot = input.readerAdmission.source.responseSnapshotJsonb;
    if (!object(native.reading) || !object(dbSnapshot)
      || !object(dbSnapshot.reading)
      || !object(input.record.reading)
      || native.responseVersion !== 'myeonghwa-product-reading-response-v2'
      || dbSnapshot.responseVersion !== native.responseVersion
      || native.state !== 'delivered' || dbSnapshot.state !== native.state
      || typeof native.reading.readingId !== 'string'
      || native.reading.readingId !== handoffSource.readingId
      || native.reading.readingId === dbSnapshot.reading.readingId
      || dbSnapshot.reading.readingId !== input.readerAdmission.scope.readingId
      || native.responseId !== handoffSource.responseId
      || dbSnapshot.responseId !== native.responseId) return BLOCKED;

    const originalView = projectProductReadingResponseV2(native);
    const storedView = projectProductReadingResponseV2(dbSnapshot);
    if (originalView.kind !== 'delivered'
      || storedView.kind !== 'delivered'
      || originalView.responseState !== 'delivered'
      || storedView.responseState !== 'delivered'
      || originalView.readingId !== native.reading.readingId
      || storedView.readingId !== dbSnapshot.reading.readingId) return BLOCKED;

    // Saju's existing deterministicContentHash contract, no new algorithm.
    const nativeDigest = hashSajuHeldSourceProofRequestV1(native);
    if (handoffSource.responseBodyHash !== nativeDigest) return BLOCKED;

    // This temporary comparison value is not the stored/issued response.
    // Every field besides reading.readingId is compared by a canonical digest.
    // It also binds subject/calculation/section/disclosure/created-at metadata,
    // which visible SourceUnit text-parity alone cannot protect.
    const sameIdProjection = {
      ...dbSnapshot,
      reading: {
        ...dbSnapshot.reading,
        readingId: native.reading.readingId,
      },
    };
    if (hashSajuHeldSourceProofRequestV1(sameIdProjection) !== nativeDigest) {
      return BLOCKED;
    }
    return decision(true);
  } catch {
    return BLOCKED;
  }
}
