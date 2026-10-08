import { READER_PRESENTATIONS } from './reader-presentation-catalog.js';

/**
 * Product rollout candidates, NOT an entitlement or server grant.
 * All Character identity/Reading/Thread access remains server-authoritative.
 * Public paid Reader Interpretation is not activated by this file.
 */
export const READER_PREVIEW_CANDIDATE_IDS_V1 = Object.freeze(['seyeon']);
export const READER_PUBLIC_INTERPRETATION_ENABLED_V1 = false;

const previewCandidates = new Set(READER_PREVIEW_CANDIDATE_IDS_V1);
const officialReaderIds = new Set(READER_PRESENTATIONS.map((reader) => reader.key));

export function readerRolloutPresentationV1(characterId) {
  if (typeof characterId !== 'string' || !officialReaderIds.has(characterId)) {
    return Object.freeze({
      characterId: null,
      stage: 'unknown',
      previewSelectable: false,
      publicInterpretationEnabled: false,
      label: 'Reader 준비 중',
    });
  }
  const previewSelectable = previewCandidates.has(characterId);
  return Object.freeze({
    characterId,
    stage: previewSelectable ? 'preview_presentation' : 'concept_pending',
    previewSelectable,
    publicInterpretationEnabled: READER_PUBLIC_INTERPRETATION_ENABLED_V1,
    label: previewSelectable ? '프리뷰 장면' : '캐릭터 준비 중',
  });
}

export function resolveReaderPresentationCandidateV1(characterId) {
  if (readerRolloutPresentationV1(characterId).previewSelectable) return characterId;
  return READER_PREVIEW_CANDIDATE_IDS_V1[0];
}
