import { describe, expect, it } from 'vitest';
import {
  FACE_DIRECT_SOURCE_VERIFICATION_RESEARCH_V0,
  materializeVerifiedSourcePassage,
  validateDirectSourceVerificationRegistry,
  type DirectSourcePageVerificationRecord,
  type DirectSourceVerificationRegistry,
} from '../packages/face-reading/src/index.js';

const candidate = FACE_DIRECT_SOURCE_VERIFICATION_RESEARCH_V0.candidates[0]!;
const candidateRef = `${candidate.candidateId}@${candidate.version}`;

function testRecord(overrides: Partial<DirectSourcePageVerificationRecord> = {}): DirectSourcePageVerificationRecord {
  return {
    verificationId: 'verification.shenxiang_1786.discernment.test',
    version: '1.0.0-test-only',
    candidateRef,
    witnessId: candidate.witnessId,
    passageId: 'passage.shenxiang_1786.five_officers.discernment.test',
    chapter: '卷二 / 五官說 / 審辨官',
    scanPage: 10,
    originalText: '鼻須要梁柱端直……乃為審辨官成。',
    visualEvidenceRefs: ['fixture:scan-page-10-test-only'],
    checkerRefs: ['checker:test-1'],
    state: 'scan_checked',
    mayPromoteOtherWitness: false,
    ...overrides,
  };
}

function registryWith(record: DirectSourcePageVerificationRecord): DirectSourceVerificationRegistry {
  return {
    ...FACE_DIRECT_SOURCE_VERIFICATION_RESEARCH_V0,
    pageVerifications: [record],
  };
}

describe('FR-8 direct-source candidate authority', () => {
  it('registers the 1786 volume-2 scan as a verified witness candidate without inventing a passage page', () => {
    expect(() => validateDirectSourceVerificationRegistry(FACE_DIRECT_SOURCE_VERIFICATION_RESEARCH_V0)).not.toThrow();
    expect(candidate).toMatchObject({
      witnessId: 'witness.shenxiang_quanbian.baohanlou_1786_v2',
      publicationYear: 1786,
      pageCount: 86,
      state: 'witness_verified_passage_unlocated',
      mayPromoteOtherWitness: false,
    });
    expect(FACE_DIRECT_SOURCE_VERIFICATION_RESEARCH_V0.pageVerifications).toHaveLength(0);
  });

  it('rejects a page verification that claims another witness identity', () => {
    const invalid = registryWith(testRecord({ witnessId: 'witness.shenxiang_quanbian.nlc_1925' }));
    expect(() => validateDirectSourceVerificationRegistry(invalid)).toThrow(/witnessId does not match candidate/u);
  });

  it('rejects out-of-range scan pages and empty visual evidence', () => {
    expect(() => validateDirectSourceVerificationRegistry(registryWith(testRecord({ scanPage: 87 })))).toThrow(/within candidate page count/u);
    expect(() => validateDirectSourceVerificationRegistry(registryWith(testRecord({ visualEvidenceRefs: [] })))).toThrow(/visualEvidenceRefs must be non-empty/u);
  });

  it('requires two independent checker refs before double_checked promotion', () => {
    const invalid = registryWith(testRecord({ state: 'double_checked', checkerRefs: ['checker:test-1'] }));
    expect(() => validateDirectSourceVerificationRegistry(invalid)).toThrow(/at least two checker refs/u);
  });

  it('materializes a new passage under its own witness rather than mutating the CText/NLC passage', () => {
    const record = testRecord();
    const registry = registryWith(record);
    const passage = materializeVerifiedSourcePassage(record, registry);

    expect(passage).toEqual({
      passageId: 'passage.shenxiang_1786.five_officers.discernment.test',
      witnessId: 'witness.shenxiang_quanbian.baohanlou_1786_v2',
      chapter: '卷二 / 五官說 / 審辨官',
      scanPage: 10,
      originalText: '鼻須要梁柱端直……乃為審辨官成。',
      verificationStatus: 'scan_checked',
    });
    expect(passage.witnessId).not.toBe('witness.shenxiang_quanbian.nlc_1925');
    expect(passage.witnessId).not.toBe('witness.shenxiang_quanbian.ctext');
  });

  it('rejects an attempted cross-witness promotion flag even through an unsafe cast', () => {
    const forged = {
      ...testRecord(),
      mayPromoteOtherWitness: true,
    } as unknown as DirectSourcePageVerificationRecord;
    expect(() => validateDirectSourceVerificationRegistry(registryWith(forged))).toThrow(/must not promote another witness/u);
  });
});
