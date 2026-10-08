/**
 * Backend Reader staging policy. This is a release-admission constraint,
 * NOT Product purchase, entitlement, Character Unlock, thread ownership,
 * content publication, or public API activation authority.
 *
 * This first tranche intentionally permits ONLY Se-yeon after all existing
 * authoritative Reader + Official Reading checks have succeeded.
 * The nine Reader runtime contract remains character-agnostic.
 */
export const OFFICIAL_READER_RUNTIME_IDS_V1 = Object.freeze([
  'seyeon', 'baekheon', 'yeoul', 'seorin', 'rahyeon',
  'mira', 'taegyeom', 'yunho', 'doyun',
] as const);

export type OfficialReaderRuntimeIdV1 = (typeof OFFICIAL_READER_RUNTIME_IDS_V1)[number];

export const READER_RUNTIME_INTERNAL_PREVIEW_CANDIDATES_V1 =
  Object.freeze(['seyeon'] as const);

/** Public paid Reader Interpretation is still unavailable. */
export const READER_RUNTIME_PUBLIC_ACTIVATED_V1 = false as const;

const officialReaderIds = new Set<string>(OFFICIAL_READER_RUNTIME_IDS_V1);
const internalPreviewCandidates = new Set<string>(READER_RUNTIME_INTERNAL_PREVIEW_CANDIDATES_V1);

export type ReaderRuntimeRolloutDecisionV1 =
  | Readonly<{ status: 'candidate'; readerCharacterId: OfficialReaderRuntimeIdV1 }>
  | Readonly<{ status: 'withheld'; readerCharacterId: string | null; reason: 'concept_pending' | 'unknown_reader' }>;

export function resolveReaderRuntimeRolloutCandidateV1(
  readerCharacterId: unknown,
): ReaderRuntimeRolloutDecisionV1 {
  if (typeof readerCharacterId !== 'string' || !officialReaderIds.has(readerCharacterId)) {
    return Object.freeze({ status: 'withheld', readerCharacterId: null, reason: 'unknown_reader' });
  }
  if (!internalPreviewCandidates.has(readerCharacterId)) {
    return Object.freeze({
      status: 'withheld',
      readerCharacterId,
      reason: 'concept_pending',
    });
  }
  return Object.freeze({
    status: 'candidate',
    readerCharacterId: readerCharacterId as OfficialReaderRuntimeIdV1,
  });
}

export class ReaderRuntimeRolloutWithheldErrorV1 extends Error {
  readonly code = 'PERSPECTIVE_UNAVAILABLE' as const;
  constructor() {
    super('Selected Reader is not released for the bounded production runtime preview.');
    this.name = 'ReaderRuntimeRolloutWithheldErrorV1';
  }
}

/**
 * Call only with a SERVER-resolved Reader identity from the authorized thread
 * and delivered Official Reading. Never call with a URL or UI Reader hint.
 */
export function assertReaderRuntimeInternalPreviewCandidateV1(
  serverReaderCharacterId: unknown,
): void {
  if (resolveReaderRuntimeRolloutCandidateV1(serverReaderCharacterId).status !== 'candidate') {
    throw new ReaderRuntimeRolloutWithheldErrorV1();
  }
}
