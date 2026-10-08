import { projectProductReadingResponseV2 } from '../../../packages/api-client/src/product-reading-display.js';
import type { BirthProfileReadResponseV1 } from './birth-profile-read.js';
import { readBoundCurrentBirthProfileV1 } from './current-subject-saju-calculation-http.js';
import { executeCurrentBirthProfileSajuReadingV1 } from './saju-production-reading-execution.js';
import {
  createSajuPreviewReadingHttpAdapterV1,
  type SajuProductionReadingHttpAdapterConfigV1,
} from './saju-production-reading-http-adapter.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

export const SAJU_HELD_COMPOSITE_PREVIEW_VERSION_V1 =
  'myeongha-held-composite-preview-v1' as const;

/**
 * Strictly internal Preview rehearsal. Not a public API, product execution
 * endpoint, commerce admission, Production Reading path, or source authority.
 */
const REHEARSAL_READING_TEXTS_V1 = ['전체 사주', '연애운'] as const;
const REHEARSAL_SLOT_IDS_V1 = ['natal', 'relationship'] as const;

export type HeldCompositePreviewReasonV1 =
  | 'birth_profile_unavailable'
  | 'preview_transport_unavailable'
  | 'preview_response_invalid'
  | 'preview_response_not_delivered'
  | 'duplicate_reading_identity'
  | 'current_birth_revision_changed'
  | 'source_provenance_not_exposed';

export type HeldCompositePreviewResultV1 = Readonly<{
  version: typeof SAJU_HELD_COMPOSITE_PREVIEW_VERSION_V1;
  status: 'hold' | 'blocked';
  reason: HeldCompositePreviewReasonV1;
  checkedSlots: readonly string[];
  sourceAuthority: 'NOT_EVALUATED';
  releaseAuthorization: 'NOT_EVALUATED';
  canExecute: false;
  canPublish: false;
  canSell: false;
}>;

export interface RehearseCurrentSubjectHeldCompositePreviewInputV1 {
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly pool: PostgresSubjectPoolV1;
  /**
   * Only the actual /api/preview/readings adapter is constructed in this module.
   * Production /api/readings cannot be selected by caller-supplied route.
   * A synthetic fetchImpl is suitable for tests, never proof of source semantics.
   */
  readonly adapterConfig: SajuProductionReadingHttpAdapterConfigV1<unknown>;
}

function output(
  status: HeldCompositePreviewResultV1['status'],
  reason: HeldCompositePreviewReasonV1,
  slots: readonly string[] = [],
): HeldCompositePreviewResultV1 {
  return Object.freeze({
    version: SAJU_HELD_COMPOSITE_PREVIEW_VERSION_V1,
    status,
    reason,
    checkedSlots: Object.freeze([...slots]),
    sourceAuthority: 'NOT_EVALUATED' as const,
    releaseAuthorization: 'NOT_EVALUATED' as const,
    canExecute: false as const,
    canPublish: false as const,
    canSell: false as const,
  });
}

function sameAuthorizedBirthSnapshot(
  before: BirthProfileReadResponseV1,
  after: BirthProfileReadResponseV1,
): boolean {
  const a = before.currentRevision;
  const b = after.currentRevision;
  const i = a.input;
  const j = b.input;

  return before.birthProfileId === after.birthProfileId
    && before.profileKind === 'self'
    && after.profileKind === 'self'
    && before.archivedAt === null
    && after.archivedAt === null
    && a.revisionId === b.revisionId
    && a.revisionNo === b.revisionNo
    && i.calendarType === j.calendarType
    && i.birthDate === j.birthDate
    && i.birthTime === j.birthTime
    && i.timeKnown === j.timeKnown
    && i.isLeapMonth === j.isLeapMonth
    && i.sex === j.sex;
}

/**
 * Reuses the verified-subject PostgreSQL Birth authority and the existing
 * lifecycle-attested Saju Preview transport. The database transaction always
 * commits before an upstream HTTP request. A fresh authority read after both
 * slots rejects a stale or changed current Birth revision.
 *
 * This only rehearses source-admitted Preview transport and public display
 * vocabulary. Saju ProductReadingResponse does not expose authoritative
 * subject/revision/profile content hash/claim provenance for a real composite
 * product, so even a structurally valid pair ALWAYS returns HOLD and cannot
 * be published, persisted as an official composite, or sold.
 */
export async function rehearseCurrentSubjectHeldCompositePreviewV1(
  input: RehearseCurrentSubjectHeldCompositePreviewInputV1,
): Promise<HeldCompositePreviewResultV1> {
  let current: BirthProfileReadResponseV1;
  try {
    current = await readBoundCurrentBirthProfileV1({
      pool: input.pool,
      verifiedEvidence: input.verifiedEvidence,
    });
  } catch {
    return output('blocked', 'birth_profile_unavailable');
  }

  // Preview transport is constructed here so a Production adapter cannot be
  // passed in place of a Preview adapter. No client-visible route is created.
  let adapter;
  try {
    adapter = createSajuPreviewReadingHttpAdapterV1(input.adapterConfig);
  } catch {
    return output('blocked', 'preview_transport_unavailable');
  }

  const identities = new Set<string>();
  const responseIdentities = new Set<string>();
  const checkedSlots: string[] = [];

  for (let index = 0; index < REHEARSAL_READING_TEXTS_V1.length; index += 1) {
    const readingText = REHEARSAL_READING_TEXTS_V1[index];
    const slotId = REHEARSAL_SLOT_IDS_V1[index];
    if (readingText === undefined || slotId === undefined) {
      return output('blocked', 'preview_response_invalid');
    }

    let raw: unknown;
    try {
      raw = await executeCurrentBirthProfileSajuReadingV1({
        profile: current,
        readingText,
        adapter,
      });
    } catch {
      return output('blocked', 'preview_transport_unavailable');
    }

    let display;
    try {
      display = projectProductReadingResponseV2(raw);
    } catch {
      return output('blocked', 'preview_response_invalid');
    }

    if (display.kind !== 'delivered') {
      return output('blocked', 'preview_response_not_delivered');
    }

    const responseId = (raw as { responseId?: unknown }).responseId;
    if (typeof responseId !== 'string'
      || identities.has(display.readingId)
      || responseIdentities.has(responseId)) {
      return output('blocked', 'duplicate_reading_identity');
    }

    identities.add(display.readingId);
    responseIdentities.add(responseId);
    checkedSlots.push(slotId);
  }

  let latest: BirthProfileReadResponseV1;
  try {
    latest = await readBoundCurrentBirthProfileV1({
      pool: input.pool,
      verifiedEvidence: input.verifiedEvidence,
    });
  } catch {
    return output('blocked', 'birth_profile_unavailable');
  }

  if (!sameAuthorizedBirthSnapshot(current, latest)) {
    return output('blocked', 'current_birth_revision_changed');
  }

  // A genuine Saju source-owned per-response provenance/coverage binding is
  // still unavailable. Do not synthesize refs to satisfy 2B-1's fixture gate.
  return output('hold', 'source_provenance_not_exposed', checkedSlots);
}
