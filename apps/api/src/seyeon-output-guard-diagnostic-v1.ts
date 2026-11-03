import {
  SeyeonRendererGuardErrorV2,
  SEYEON_SEMANTIC_FAILURE_CODES_V2,
} from '../../../packages/domain/src/seyeon-renderer-v2.js';

/** Fixed codes only: never serialize model evidence, excerpts, prompts or errors. */
export function seyeonOutputGuardDiagnosticV1(error: unknown) {
  const codes = ['OUTPUT_STRUCTURE_INVALID', 'REVIEW_HASH_MISMATCH',
    'REVIEW_EVIDENCE_INVALID', 'SEMANTIC_REVIEW_REJECTED'] as const;
  if (!(error instanceof SeyeonRendererGuardErrorV2) || !codes.includes(error.code)) {
    return { guardFailureCode: null, semanticFailureCodes: [] };
  }
  return {
    guardFailureCode: error.code,
    semanticFailureCodes: SEYEON_SEMANTIC_FAILURE_CODES_V2.filter(code =>
      Array.isArray(error.failureCodes) && error.failureCodes.includes(code)),
  };
}
