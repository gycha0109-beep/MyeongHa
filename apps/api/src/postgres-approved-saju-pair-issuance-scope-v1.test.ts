import { describe, expect, it } from 'vitest';
import { getApprovedSajuOfferV1 } from '../../../packages/contracts/src/approved-saju-catalog.js';
import {
  readApprovedSajuPairIssueScopeV1,
  readApprovedSajuPairReaderScopeV1,
} from './postgres-approved-saju-issue-scope-v1.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

const SUBJECT = '11111111-1111-4111-8111-111111111111';
const PURCHASE = '22222222-2222-4222-8222-222222222222';
const OWN_REVISION = '33333333-3333-4333-8333-333333333333';
const TARGET_REVISION = '44444444-4444-4444-8444-444444444444';
const TARGET_PERSON = '55555555-5555-4555-8555-555555555555';

type OfferId = 'first-counterpart' | 'additional-counterpart' | 'relationship-plus-first';
const OFFERS: readonly OfferId[] = [
  'first-counterpart', 'additional-counterpart', 'relationship-plus-first',
];

function fixture(offerId: OfferId) {
  return {
    admissionHash: 'a'.repeat(64),
    approvedOfferId: offerId,
    counterpartOrder: offerId === 'additional-counterpart' ? 'additional' : 'first',
    targetPersonId: TARGET_PERSON,
    useApprovalRef: 'consent-for-purchased-pair-v1',
    birthRevisionId: OWN_REVISION,
    sourceBirthInputHash: 'sha256:v1:' + 'b'.repeat(64),
    targetBirthRevisionId: TARGET_REVISION,
    targetBirthInputHash: 'sha256:v1:' + 'c'.repeat(64),
    periodReferenceDateTime: null,
    releaseRef: 't10-verified-release-candidate-v1',
    birth: {
      calendarType: 'solar', birthDate: '1990-05-15',
      birthTime: '14:30', timeKnown: true, isLeapMonth: false, sex: 'female',
    },
    targetBirth: {
      calendarType: 'solar', birthDate: '1996-06-05',
      birthTime: '09:30', timeKnown: true, isLeapMonth: false, sex: 'male',
    },
  };
}

function db(
  scope: unknown,
  facade: 'qry_approved_saju_pair_issue_scope_v1' | 'qry_approved_saju_pair_reader_scope_v1' =
    'qry_approved_saju_pair_issue_scope_v1',
): PostgresTransactionQueryV1 {
  return {
    async query<Row>(sql: string, values?: readonly unknown[]) {
      expect(sql).toContain(facade);
      expect(values).toEqual([SUBJECT, PURCHASE]);
      return { rows: [{ scope }] as unknown as Row[] };
    },
  };
}

describe('read-only T10 Reader scope does not require issuance admission', () => {
  it.each(OFFERS)('accepts the same signed purchase scope for %s without issuer privileges', async offerId => {
    const scope = await readApprovedSajuPairReaderScopeV1(
      db(fixture(offerId),'qry_approved_saju_pair_reader_scope_v1'),
      {subjectId:SUBJECT,purchaseIntentId:PURCHASE},
    );
    const issuerScope = await readApprovedSajuPairIssueScopeV1(db(fixture(offerId)),{
      subjectId:SUBJECT,purchaseIntentId:PURCHASE,
    });
    expect(scope).toEqual(issuerScope);
    expect(scope?.paidComparison.authorizedForIssue).toBe(false);
  });

  it('denies withdrawn purchase consent and foreign pair substitution', async () => {
    expect(await readApprovedSajuPairReaderScopeV1(
      db(null,'qry_approved_saju_pair_reader_scope_v1'),
      {subjectId:SUBJECT,purchaseIntentId:PURCHASE},
    )).toBeNull();
    await expect(readApprovedSajuPairReaderScopeV1(
      db({...fixture('first-counterpart'),targetBirthRevisionId:OWN_REVISION},
        'qry_approved_saju_pair_reader_scope_v1'),
      {subjectId:SUBJECT,purchaseIntentId:PURCHASE},
    )).rejects.toThrow('Approved Saju comparison scope');
  });
});

describe('paid T10 pair source scope preserves approved offer plus exact consent', () => {
  it.each(OFFERS)('maps %s from the consent-locked purchase, never from client selection', async offerId => {
    const scope = await readApprovedSajuPairIssueScopeV1(db(fixture(offerId)), {
      subjectId: SUBJECT, purchaseIntentId: PURCHASE,
    });
    expect(scope).not.toBeNull();
    const expected = getApprovedSajuOfferV1(offerId)!;
    expect(scope?.paidComparison).toEqual({
      offerId,
      counterpartOrder: expected.counterpartOrder,
      targetPersonId: TARGET_PERSON,
      useApprovalRef: 'consent-for-purchased-pair-v1',
      requiredComponents: [...expected.components],
      releaseRef: 't10-verified-release-candidate-v1',
      authorizedForIssue: false,
    });
    expect(scope?.sourceRequestHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(scope?.request.birth.date).toBe('1990-05-15');
    expect(scope?.request.partnerBirth.date).toBe('1996-06-05');
    expect(scope?.request.birth).not.toBe(scope?.request.partnerBirth);
    expect(scope?.birthRevisionId).toBe(OWN_REVISION);
    expect(scope?.targetBirthRevisionId).toBe(TARGET_REVISION);
  });

  it.each(OFFERS)('rejects missing, wrong-order and arbitrary consent in %s', async offerId => {
    const row = fixture(offerId);
    await expect(readApprovedSajuPairIssueScopeV1(db({
      ...row, counterpartOrder: offerId === 'additional-counterpart' ? 'first' : 'additional',
    }), { subjectId: SUBJECT, purchaseIntentId: PURCHASE })).rejects.toThrow(
      'Approved Saju comparison scope',
    );
    await expect(readApprovedSajuPairIssueScopeV1(db({
      ...row, useApprovalRef: '',
    }), { subjectId: SUBJECT, purchaseIntentId: PURCHASE })).rejects.toThrow(
      'Approved Saju comparison scope',
    );
    await expect(readApprovedSajuPairIssueScopeV1(db({
      ...row, targetPersonId: OWN_REVISION.replace(/3/g, 'x'),
    }), { subjectId: SUBJECT, purchaseIntentId: PURCHASE })).rejects.toThrow(
      'Approved Saju comparison scope',
    );
  });

  it('holds missing pair, reused birth revision and non-comparison offer', async () => {
    expect(await readApprovedSajuPairIssueScopeV1(db(null), {
      subjectId: SUBJECT, purchaseIntentId: PURCHASE,
    })).toBeNull();
    const row = fixture('first-counterpart');
    for (const altered of [
      { ...row, birthRevisionId: TARGET_REVISION },
      { ...row, approvedOfferId: 'relationship' },
      { ...row, periodReferenceDateTime: '2026-11-13T00:00:00.000Z' },
    ]) {
      await expect(readApprovedSajuPairIssueScopeV1(db(altered), {
        subjectId: SUBJECT, purchaseIntentId: PURCHASE,
      })).rejects.toThrow('Approved Saju comparison scope');
    }
  });
});
