import { describe, expect, it } from 'vitest';
import type { CharacterStandardChatGroundingV2 } from '../apps/api/src/character-standard-reading-chat-grounding-v2.js';
import {
  OfficialReaderSajuSourceCandidateErrorV1,
  assertServerOfficialReaderSajuSourceCandidateV1,
  prepareOfficialReaderSajuSourceCandidateV1,
} from '../apps/api/src/official-reader-saju-source-candidate-v1.js';

describe('Official Reader Saju private source candidate', () => {
  it('denies a structurally plausible client/LLM Saju grounding without server issuer identity', () => {
    const spoof = Object.freeze({
      scope: Object.freeze({
        subjectId: 'not-a-real-subject',
        readingId: 'not-a-real-reading',
        readerCharacterId: 'seyeon',
        officialArtifactResponseHash: 'sha256:v1:' + 'a'.repeat(64),
      }),
      grounding: Object.freeze({
        readingRef: 'not-a-real-reading',
        readingDomain: 'career',
        groundingHash: 'b'.repeat(64),
        units: Object.freeze([
          Object.freeze({ unitId: 'grounding_unit_' + 'a'.repeat(24) }),
        ]),
      }),
      context: Object.freeze({ saju: Object.freeze({
        groundingRef: Object.freeze({ groundingHash: 'b'.repeat(64) }),
      }) }),
    }) as unknown as CharacterStandardChatGroundingV2;

    expect(() => prepareOfficialReaderSajuSourceCandidateV1({
      grounded: spoof,
      focusedUnitRef: 'grounding_unit_' + 'a'.repeat(24),
    })).toThrowError(OfficialReaderSajuSourceCandidateErrorV1);
    expect(() => prepareOfficialReaderSajuSourceCandidateV1({
      grounded: spoof,
      focusedUnitRef: 'grounding_unit_' + 'a'.repeat(24),
    })).toThrowError(expect.objectContaining({ code: 'ACCESS_DENIED' }));
  });

  it('rejects a fake persisted candidate and a byte-for-byte-shaped clone as source authority', () => {
    const fake = Object.freeze({
      schemaVersion: 'official-reader-saju-source-candidate-v1',
      sourceUnitRefs: Object.freeze(['grounding_unit_' + 'a'.repeat(24)]),
      focusedUnitRef: 'grounding_unit_' + 'a'.repeat(24),
      sourceCandidateHash: 'sha256:v1:' + 'f'.repeat(64),
    });
    const clone = Object.freeze({ ...fake });
    for (const value of [fake, clone, null, 'grounding_unit_' + 'a'.repeat(24)]) {
      expect(() => assertServerOfficialReaderSajuSourceCandidateV1(value))
        .toThrowError(expect.objectContaining({ code: 'ACCESS_DENIED' }));
    }
  });

  it('rejects null/opaque grounded input before looking at any source properties', () => {
    for (const grounded of [null, undefined, 'forged']) {
      expect(() => prepareOfficialReaderSajuSourceCandidateV1({
        grounded: grounded as unknown as CharacterStandardChatGroundingV2,
        focusedUnitRef: 'grounding_unit_' + 'a'.repeat(24),
      })).toThrowError(expect.objectContaining({ code: 'ACCESS_DENIED' }));
    }
  });
});
