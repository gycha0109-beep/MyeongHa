import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  admitCharacterFaceGovernedInterpretationHandoffV1,
  buildCharacterFaceProtectedInterpretationSegmentsV1,
  hashCharacterFaceGovernedInterpretationMaterialV1,
  selectCharacterFaceGovernedInterpretationsV1,
} from '../packages/domain/src/character-face-governed-interpretation.js';

// Exact Saju 005K canonical output. This synthetic approval is TEST ONLY.
const fixture = JSON.parse(readFileSync(
  new URL('./fixtures/saju-face-governed-v1.json', import.meta.url), 'utf8',
)) as {
  classification: string;
  source: { authorityReceipt: { traditional: { authorityRef: string } };
    plan: { topicKey: string };
    receipt: { semanticClaims: { governedInterpretation: unknown }[] } };
  handoff: { sourceContractVersion: string; sourceResultHash: string };
};
const expectedSource = {
  sourceContractVersion: 'saju-face-governed-interpretation-source-v1',
  sourceAuthorityRef: fixture.source.authorityReceipt.traditional.authorityRef,
  sourceResultHash: fixture.handoff.sourceResultHash,
  topicKey: fixture.source.plan.topicKey,
};

describe('TOPIC-FACE-005K Saju wire compatibility (contract only)', () => {
  it('admits the exact source-emitted wire object without mapping or enrichment', () => {
    expect(fixture.classification).toBe('synthetic_contract_only');
    const admitted = admitCharacterFaceGovernedInterpretationHandoffV1({
      candidate: fixture.handoff, expectedSource,
    });
    expect(admitted).toEqual(fixture.handoff);
    expect(admitted.units).toEqual(fixture.source.receipt.semanticClaims.map((claim) => claim.governedInterpretation));
    expect(admitted.sourceAuthorityRef.startsWith('test-only:')).toBe(true);
  });

  it('preserves protected meaning, conditions, qualifiers and all source refs during selection', () => {
    const handoff = admitCharacterFaceGovernedInterpretationHandoffV1({ candidate: fixture.handoff, expectedSource });
    const selection = selectCharacterFaceGovernedInterpretationsV1({ handoff, preferredLensOrder: [], maxUnits: 3 });
    const segments = buildCharacterFaceProtectedInterpretationSegmentsV1({ handoff, selection });
    const unit = handoff.units[0]!;
    expect(segments).toEqual([{
      interpretationId: unit.interpretationId, lensKey: unit.lensKey,
      direction: unit.direction, evidenceStatus: unit.evidenceStatus, text: unit.protectedMeaningText,
      conditions: unit.conditions, qualifiers: unit.qualifiers, observationRefs: unit.observationRefs,
      bindingRefs: unit.bindingRefs, evidenceRefs: unit.evidenceRefs, sourceRefs: unit.sourceRefs,
    }]);
  });

  it.each(['sourceResultHash', 'handoffHash', 'authorizationReceiptRef'])('rejects unchanged-hash %s tampering', (key) => {
    expect(() => admitCharacterFaceGovernedInterpretationHandoffV1({
      candidate: { ...fixture.handoff, [key]: 'tampered' }, expectedSource,
    })).toThrow();
  });

  it('rejects a valid content hash bound to another source result', () => {
    const candidate = { ...fixture.handoff, sourceResultHash: 'test-only:other-source' };
    const { handoffHash: _old, ...material } = candidate as typeof candidate & { handoffHash: string };
    void _old;
    expect(() => admitCharacterFaceGovernedInterpretationHandoffV1({ candidate: {
      ...material, handoffHash: 'face-governed-interpretation:' + hashCharacterFaceGovernedInterpretationMaterialV1(material),
    }, expectedSource })).toThrow(/trusted upstream binding/);
  });
});
