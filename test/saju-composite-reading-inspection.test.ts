import { describe, expect, it } from 'vitest';
import {
  inspectGovernedSajuCompositeReadingV1,
  type SajuCompositeReadingInspectionInputV1,
} from '../apps/api/src/saju-composite-reading-inspection-v1.js';

const context = Object.freeze({
  subjectId: 'subject:fixture-1',
  birthProfileId: 'birth-profile:fixture-1',
  birthRevisionId: 'birth-revision:fixture-7',
  birthRevisionNo: 7,
  engineVersion: 'saju-engine:fixture-v1',
  sourceSnapshotRef: 'saju-source:fixture-v1',
});

const natalRef = Object.freeze({
  id: 'profile:general-natal',
  version: 'profile-v1',
  contentHash: 'a'.repeat(64),
});
const relationshipRef = Object.freeze({
  id: 'profile:relationship-natal',
  version: 'profile-v1',
  contentHash: 'b'.repeat(64),
});

function reading(slotId: string, serial: string) {
  return {
    responseId: 'reading_response_' + serial.repeat(24),
    responseVersion: 'myeonghwa-product-reading-response-v2',
    state: 'delivered',
    messageCode: 'READING_DELIVERED',
    requiredAction: 'none',
    reading: {
      readingId: 'synthetic-reading-' + slotId,
      sections: [{
        sectionType: slotId === 'natal' ? 'personality' : 'relationship',
        state: 'complete',
        title: slotId === 'natal' ? '원국의 구조' : '연애의 구조',
        blocks: [{ type: 'paragraph', text: '각 슬롯에서 독립적으로 승인돼야 할 연구용 텍스트' }],
      }],
      disclosures: [{ type: 'scope_limitation', text: '합성 fixture일 뿐 실제 명리 의미 승인 아님' }],
    },
  };
}

function fixture(): SajuCompositeReadingInspectionInputV1 {
  return {
    mode: 'synthetic_inspection_only',
    productId: 'natal-relationship-inspection',
    productVersion: 'candidate-2b',
    context,
    slots: [
      {
        slotId: 'natal',
        requirement: 'required',
        readingText: '전체 사주',
        profileRef: natalRef,
      },
      {
        slotId: 'relationship',
        requirement: 'required',
        readingText: '연애운',
        profileRef: relationshipRef,
      },
    ],
    results: [
      {
        slotId: 'natal',
        readingText: '전체 사주',
        binding: context,
        profileRef: natalRef,
        sourceEvidenceRef: 'source-evidence:synthetic-natal',
        response: reading('natal', 'a'),
      },
      {
        slotId: 'relationship',
        readingText: '연애운',
        binding: context,
        profileRef: relationshipRef,
        sourceEvidenceRef: 'source-evidence:synthetic-relationship',
        response: reading('relationship', 'b'),
      },
    ],
  };
}

function clone(): any {
  return structuredClone(fixture());
}

describe('2B synthetic composite Saju Reading consistency inspector', () => {
  it('accepts the two independently display-admitted synthetic slots without granting permissions', () => {
    const result = inspectGovernedSajuCompositeReadingV1(fixture());
    expect(result).toMatchObject({
      state: 'consistent_fixture',
      productId: 'natal-relationship-inspection',
      sourceAuthority: 'NOT_EVALUATED',
      releaseAuthorization: 'NOT_EVALUATED',
      canExecute: false,
      canPublish: false,
      canSell: false,
    });
    expect(result.inspected.map((item) => item.slotId)).toEqual(['natal', 'relationship']);
    expect(result.inspected.map((item) => item.profileRef.contentHash)).toEqual([
      natalRef.contentHash,
      relationshipRef.contentHash,
    ]);
    expect(JSON.stringify(result)).not.toContain('각 슬롯에서 독립적으로');
  });

  it.each([
    ['subjectId', 'subject:other'],
    ['birthProfileId', 'birth-profile:other'],
    ['birthRevisionId', 'birth-revision:8'],
    ['birthRevisionNo', 8],
    ['engineVersion', 'saju-engine:fixture-v2'],
    ['sourceSnapshotRef', 'saju-source:other'],
  ])('blocks mixed authority-bound %s without reading content', (key, value) => {
    const input = clone();
    input.results[1].binding[key] = value;
    const result = inspectGovernedSajuCompositeReadingV1(input);
    expect(result).toMatchObject({
      state: 'blocked',
      reason: 'binding_mismatch',
      inspected: [],
      canExecute: false,
    });
  });

  it('rejects changed source profile content for the same id/version', () => {
    const input = clone();
    input.results[0].profileRef.contentHash = 'c'.repeat(64);
    expect(inspectGovernedSajuCompositeReadingV1(input)).toMatchObject({
      state: 'blocked',
      reason: 'profile_ref_mismatch',
    });
  });

  it('rejects a missing source evidence identifier rather than manufacturing provenance', () => {
    const input = clone();
    delete input.results[0].sourceEvidenceRef;
    expect(inspectGovernedSajuCompositeReadingV1(input)).toMatchObject({
      state: 'blocked',
      reason: 'source_evidence_missing',
    });
  });

  it('blocks required missing slots and never substitutes a different reading', () => {
    const input = clone();
    input.results.pop();
    expect(inspectGovernedSajuCompositeReadingV1(input)).toMatchObject({
      state: 'blocked',
      reason: 'missing_required_slot',
      inspected: [],
    });
  });

  it('holds an optional missing slot pending an independently approved product policy', () => {
    const input = clone();
    input.slots[1].requirement = 'optional';
    input.results.pop();
    expect(inspectGovernedSajuCompositeReadingV1(input)).toMatchObject({
      state: 'held_for_policy',
      reason: 'missing_optional_slot',
      canExecute: false,
      canSell: false,
    });
  });

  it('does not treat an optional partial-evidence response as delivered', () => {
    const input = clone();
    input.slots[1].requirement = 'optional';
    input.results[1].response = {
      responseId: 'reading_response_' + 'b'.repeat(24),
      responseVersion: 'myeonghwa-product-reading-response-v2',
      state: 'partial_evidence',
      messageCode: 'READING_EVIDENCE_PARTIAL',
      requiredAction: 'none',
      coverage: { state: 'partial', hasAvailableEvidence: true, missingRequirementCount: 1 },
    };
    expect(inspectGovernedSajuCompositeReadingV1(input)).toMatchObject({
      state: 'held_for_policy',
      reason: 'response_not_delivered',
    });
  });

  it('blocks non-delivered responses for required slots', () => {
    const input = clone();
    input.results[0].response = {
      responseId: 'reading_response_' + 'a'.repeat(24),
      responseVersion: 'myeonghwa-product-reading-response-v2',
      state: 'insufficient_evidence',
      messageCode: 'READING_EVIDENCE_INSUFFICIENT',
      requiredAction: 'none',
      coverage: { state: 'insufficient', hasAvailableEvidence: false, missingRequirementCount: 2 },
    };
    expect(inspectGovernedSajuCompositeReadingV1(input)).toMatchObject({
      state: 'blocked',
      reason: 'response_not_delivered',
    });
  });

  it('blocks malformed/ad-hoc semantic blocks through the existing shared public projector', () => {
    const input = clone();
    input.results[1].response.reading.sections[0].blocks[0] = {
      type: 'unapproved_prediction',
      text: '첫사랑과 재회가 확정된다',
    };
    expect(inspectGovernedSajuCompositeReadingV1(input)).toMatchObject({
      state: 'blocked',
      reason: 'invalid_response',
    });
  });

  it('rejects unsupported annual and monthly preview requests before they can be approved', () => {
    for (const readingText of ['올해 운세', '이번 달 운세']) {
      const input = clone();
      input.slots[1].readingText = readingText;
      input.results[1].readingText = readingText;
      expect(inspectGovernedSajuCompositeReadingV1(input)).toMatchObject({
        state: 'blocked',
        reason: 'unapproved_reading_text',
      });
    }
  });

  it.each([
    ['unknown_result_slot', (input: any) => { input.results[1].slotId = 'intruder'; }],
    ['duplicate_result_slot', (input: any) => { input.results[1].slotId = 'natal'; }],
    ['duplicate_reading_identity', (input: any) => { input.results[1].response.responseId = input.results[0].response.responseId; }],
    ['duplicate_reading_identity', (input: any) => { input.results[1].response.reading.readingId = input.results[0].response.reading.readingId; }],
  ])('rejects invalid result identity: %s', (reason, modify) => {
    const input = clone();
    modify(input);
    expect(inspectGovernedSajuCompositeReadingV1(input)).toMatchObject({
      state: 'blocked',
      reason,
      inspected: [],
    });
  });

  it('rejects result that claims another slot readingText', () => {
    const input = clone();
    input.results[0].readingText = '사업운';
    expect(inspectGovernedSajuCompositeReadingV1(input)).toMatchObject({
      state: 'blocked',
      reason: 'binding_mismatch',
    });
  });

  it('rejects injected commercial authority in any level of the inspection envelope', () => {
    const root = clone();
    root.canSell = true;
    expect(inspectGovernedSajuCompositeReadingV1(root).reason).toBe('invalid_input');
    const result = clone();
    result.results[0].entitlementId = 'paid';
    expect(inspectGovernedSajuCompositeReadingV1(result).reason).toBe('invalid_input');
    const ctx = clone();
    ctx.context.productionAuthority = true;
    expect(inspectGovernedSajuCompositeReadingV1(ctx).reason).toBe('invalid_input');
  });

  it('does not allow missing identity or source revision fields', () => {
    const input = clone();
    delete input.context.birthRevisionId;
    expect(inspectGovernedSajuCompositeReadingV1(input).reason).toBe('invalid_input');
    const missingProfile = clone();
    delete missingProfile.slots[0].profileRef.contentHash;
    expect(inspectGovernedSajuCompositeReadingV1(missingProfile).reason).toBe('invalid_input');
  });

  it('keeps output deterministic, immutable and non-authorizing', () => {
    const input = fixture();
    const first = inspectGovernedSajuCompositeReadingV1(input);
    const second = inspectGovernedSajuCompositeReadingV1(input);
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.inspected)).toBe(true);
    expect(Object.isFrozen(first.inspected[0])).toBe(true);
    expect(Object.isFrozen(first.inspected[0]?.profileRef)).toBe(true);
  });
});
