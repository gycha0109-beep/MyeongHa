import { describe, expect, it } from 'vitest';
import {
  guardSeyeonRendererOutputV2, guardSeyeonSemanticReviewV2,
  hashSeyeonRendererUtteranceV2, SeyeonRendererGuardErrorV2,
  type SeyeonRendererPacketV2,
} from '../packages/domain/src/seyeon-renderer-v2.js';
import { seyeonOutputGuardDiagnosticV1 as diagnostic } from
  '../apps/api/src/seyeon-output-guard-diagnostic-v1.js';

const utterance = '비공개 합성 응답';
const review = {
  schemaVersion: 'seyeon-semantic-review-v2',
  reviewedUtteranceHash: hashSeyeonRendererUtteranceV2(utterance),
  failureCodes: ['UNDEFINED_BIOGRAPHY_INVENTION'],
  evidence: [{code: 'UNDEFINED_BIOGRAPHY_INVENTION', excerpt: utterance, reason: 'private evidence'}],
};
function capture(action: () => unknown) {
  try { action(); } catch (error) { return error; }
  throw new Error('Expected fail-closed guard rejection.');
}

describe('safe Production output guard diagnostics', () => {
  it('distinguishes a bound semantic rejection without exposing its evidence', () => {
    const error = capture(() => guardSeyeonRendererOutputV2({
      rawOutput: {schemaVersion: 'seyeon-renderer-draft-v2', utterance,
        expressionState: 'baseline', revealLevel: 'public', memoryRefsMentioned: [],
        privateSourceRefsMentioned: [], disclosureSliceIds: []},
      packet: {interpretation: {expressionState: 'baseline', reveal: {level: 'public'},
        memoryRefsUsed: [], chosenAction: {key: 'approach'}},
        disclosure: {decision: null, retrievedSources: []}, bibleSlices: []} as unknown as SeyeonRendererPacketV2,
      semanticReview: review,
    }));
    expect(diagnostic(error)).toEqual({guardFailureCode: 'SEMANTIC_REVIEW_REJECTED',
      semanticFailureCodes: ['UNDEFINED_BIOGRAPHY_INVENTION']});
    expect(JSON.stringify(diagnostic(error))).not.toContain(utterance);
    expect(JSON.stringify(diagnostic(error))).not.toContain('private evidence');
  });
  it('keeps hash mismatch, missing evidence and invalid structure fail closed', () => {
    for (const [rawOutput, code] of [
      [{...review, reviewedUtteranceHash: 'wrong'}, 'REVIEW_HASH_MISMATCH'],
      [{...review, evidence: []}, 'REVIEW_EVIDENCE_INVALID'],
      [{...review, schemaVersion: 'wrong'}, 'OUTPUT_STRUCTURE_INVALID'],
    ] as const) {
      expect(diagnostic(capture(() => guardSeyeonSemanticReviewV2({rawOutput, utterance}))))
        .toEqual({guardFailureCode: code, semanticFailureCodes: []});
    }
  });
  it('never logs arbitrary exceptions, codes, unknown failure codes or raw messages', () => {
    expect(diagnostic(Object.assign(new Error('sk-secret'), {code: 'PRIVATE'})))
      .toEqual({guardFailureCode: null, semanticFailureCodes: []});
    const error = new SeyeonRendererGuardErrorV2('private error', 'SEMANTIC_REVIEW_REJECTED');
    Object.assign(error, {failureCodes: ['sk-secret', 'HELPFUL_ASSISTANT_COLLAPSE']});
    expect(diagnostic(error)).toEqual({guardFailureCode: 'SEMANTIC_REVIEW_REJECTED',
      semanticFailureCodes: ['HELPFUL_ASSISTANT_COLLAPSE']});
  });
});
