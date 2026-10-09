import {
  RENDERER_RESPONSE_SCHEMA_V2,
  SEMANTIC_REVIEW_RESPONSE_SCHEMA_V2,
  type SeyeonStructuredProviderRequestV2,
} from './seyeon-character-runtime-v2.js';

export const SEYEON_STABLE_OUTPUT_SCHEMA_CANDIDATE_VERSION_V1 =
  'seyeon-stable-output-schema-candidate-v1' as const;

/**
 * Offline-only candidate: never called by Production or any live-model path.
 * Keeps provider JSON schemas stable across turns while preserving all
 * per-turn instructions/input and leaving authoritative server guards intact.
 *
 * The legacy builders deliberately retain their tighter per-turn enums.
 * Candidate promotion requires separate cost/quality evidence and approval.
 */
export function withStableSeyeonOutputSchemaCandidateV1(
  request: SeyeonStructuredProviderRequestV2,
): SeyeonStructuredProviderRequestV2 {
  const responseSchema =
    request.purpose === 'dialogue_render'
      ? RENDERER_RESPONSE_SCHEMA_V2
      : request.purpose === 'semantic_review'
        ? SEMANTIC_REVIEW_RESPONSE_SCHEMA_V2
        : null;
  if (responseSchema === null) {
    throw new TypeError(
      'Static output schema candidate supports only dialogue_render and semantic_review.',
    );
  }
  return Object.freeze({
    ...request,
    responseSchema,
  });
}
