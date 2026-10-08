export type ReaderRolloutStageV1 = 'unknown' | 'preview_presentation' | 'concept_pending';
export type ReaderRolloutStatusV1 = Readonly<{
  characterId: string | null;
  stage: ReaderRolloutStageV1;
  previewSelectable: boolean;
  publicInterpretationEnabled: false;
  label: string;
}>;
export const READER_PREVIEW_CANDIDATE_IDS_V1: readonly ['seyeon'];
export const READER_PUBLIC_INTERPRETATION_ENABLED_V1: false;
export function readerRolloutPresentationV1(characterId: unknown): ReaderRolloutStatusV1;
export function resolveReaderPresentationCandidateV1(characterId: unknown): string;
