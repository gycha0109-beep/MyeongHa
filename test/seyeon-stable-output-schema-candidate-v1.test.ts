import { describe, expect, it } from 'vitest';
import {
  buildSeyeonRendererRequestV2,
  buildSeyeonSemanticReviewRequestV2,
  RENDERER_RESPONSE_SCHEMA_V2,
  SEMANTIC_REVIEW_RESPONSE_SCHEMA_V2,
  type SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';
import {
  withStableSeyeonOutputSchemaCandidateV1,
} from '../apps/api/src/seyeon-stable-output-schema-candidate-v1.js';
import {
  admitSeyeonRendererDraftV2,
  guardSeyeonSemanticReviewV2,
  hashSeyeonRendererUtteranceV2,
  type SeyeonRendererPacketV2,
} from '../packages/domain/src/seyeon-renderer-v2.js';

function publicPacket(): SeyeonRendererPacketV2 {
  return {
    interpretation: {
      chosenAction: { key: 'approach' },
      expressionState: 'baseline',
      reveal: { level: 'public' },
      memoryRefsUsed: [],
    },
    disclosure: { decision: null, retrievedSources: [] },
    bibleSlices: [],
  } as unknown as SeyeonRendererPacketV2;
}

const draft = {
  schemaVersion: 'seyeon-renderer-draft-v2',
  utterance: '안녕하세요. 반가워요.',
  expressionState: 'baseline',
  revealLevel: 'public',
  memoryRefsMentioned: [],
  privateSourceRefsMentioned: [],
  disclosureSliceIds: [],
};

describe('Se-yeon stable-output-schema candidate (offline only)', () => {
  it('leaves Production request builders untouched but makes candidate schemas stable', () => {
    const packet = publicPacket();
    const render = buildSeyeonRendererRequestV2(packet);
    const review = buildSeyeonSemanticReviewRequestV2({
      packet,
      rendererDraft: draft,
      utteranceHash: hashSeyeonRendererUtteranceV2(draft.utterance),
    });
    const stableRender = withStableSeyeonOutputSchemaCandidateV1(render);
    const stableReview = withStableSeyeonOutputSchemaCandidateV1(review);

    expect(stableRender.responseSchema).toBe(RENDERER_RESPONSE_SCHEMA_V2);
    expect(stableReview.responseSchema).toBe(SEMANTIC_REVIEW_RESPONSE_SCHEMA_V2);
    expect(stableRender.instructions).toBe(render.instructions);
    expect(stableRender.input).toBe(render.input);
    expect(stableReview.instructions).toBe(review.instructions);
    expect(stableReview.input).toBe(review.input);
    expect(render.responseSchema).not.toBe(stableRender.responseSchema);
    expect(review.responseSchema).not.toBe(stableReview.responseSchema);
    expect((render.responseSchema as any).properties.expressionState.enum).toEqual(['baseline']);
    expect((review.responseSchema as any).properties.reviewedUtteranceHash.enum).toEqual([
      hashSeyeonRendererUtteranceV2(draft.utterance),
    ]);
  });

  it('reuses one review schema across different turns and refuses unrelated requests', () => {
    const packet = publicPacket();
    const one = buildSeyeonSemanticReviewRequestV2({
      packet, rendererDraft: draft, utteranceHash: 'hash-one',
    });
    const two = buildSeyeonSemanticReviewRequestV2({
      packet, rendererDraft: draft, utteranceHash: 'hash-two',
    });
    expect(withStableSeyeonOutputSchemaCandidateV1(one).responseSchema)
      .toBe(withStableSeyeonOutputSchemaCandidateV1(two).responseSchema);
    expect(() => withStableSeyeonOutputSchemaCandidateV1({
      ...one, purpose: 'integrity_classification',
    } as SeyeonStructuredProviderRequestV2)).toThrow('only dialogue_render and semantic_review');
  });

  it('server semantic hash guard still rejects forged review for a stable-schema response', () => {
    const actual = hashSeyeonRendererUtteranceV2(draft.utterance);
    expect(guardSeyeonSemanticReviewV2({
      rawOutput: {
        schemaVersion: 'seyeon-semantic-review-v2',
        reviewedUtteranceHash: actual,
        failureCodes: [],
        evidence: [],
      },
      utterance: draft.utterance,
    }).failureCodes).toEqual([]);
    expect(() => guardSeyeonSemanticReviewV2({
      rawOutput: {
        schemaVersion: 'seyeon-semantic-review-v2',
        reviewedUtteranceHash: 'sha256:v1:' + '0'.repeat(64),
        failureCodes: [],
        evidence: [],
      },
      utterance: draft.utterance,
    })).toThrow('not bound to the current renderer utterance');
  });

  it('server renderer guard still rejects forged expression or reveal state', () => {
    const packet = publicPacket();
    expect(admitSeyeonRendererDraftV2({
      rawOutput: draft,
      packet,
    }).utterance).toBe(draft.utterance);
    expect(() => admitSeyeonRendererDraftV2({
      rawOutput: { ...draft, expressionState: 'playful' },
      packet,
    })).toThrow('expressionState must match');
    expect(() => admitSeyeonRendererDraftV2({
      rawOutput: { ...draft, revealLevel: 'deep' },
      packet,
    })).toThrow('revealLevel must match');
  });
});
