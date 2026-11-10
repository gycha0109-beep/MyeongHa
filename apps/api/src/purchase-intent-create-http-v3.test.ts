import { describe, expect, it, vi } from 'vitest';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import { handlePurchaseIntentCreateRequestV3 } from './purchase-intent-create-http-v3.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import { getApprovedSajuOfferV1 } from '../../../packages/contracts/src/approved-saju-catalog.js';

const AUTH_USER_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const OFFER_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const CAPABILITY_SET_ID = '55555555-5555-4555-8555-555555555555';
const PURCHASE_INTENT_ID = '66666666-6666-4666-8666-666666666666';
const SAJU_RECORD_ID = '77777777-7777-4777-8777-777777777777';
const BIRTH_REVISION_ID = '88888888-8888-4888-8888-888888888888';
const TARGET_PERSON_ID = '99999999-9999-4999-8999-999999999999';
const TARGET_REVISION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PERIOD = '2026-11-10T01:00:00.000Z';

function post(body: unknown): Request {
  return new Request('https://myeongha.internal/internal-not-publicly-mounted', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer member-secret' },
    body: JSON.stringify(body),
  });
}

function verifier(evidence: VerifiedSubjectIdentityEvidenceV1 | null): IdentityEvidenceVerificationPortV1 {
  return { verifyRequestIdentity: vi.fn(async () => evidence) };
}

function fakePool(input: { queriedSql?: string[]; commandConstraint?: string; catalogId?: string; unavailable?: boolean } = {}): PostgresSubjectPoolV1 {
  const approved = input.catalogId === undefined ? undefined : getApprovedSajuOfferV1(input.catalogId);
  return {
    async connect(): Promise<PostgresSubjectConnectionV1> {
      return {
        async query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly Row[] }> {
          input.queriedSql?.push(text);
          if (text === 'BEGIN' || text.startsWith('SET LOCAL ROLE') || text === 'COMMIT' || text === 'ROLLBACK' || text.includes('assert_myeongha_subject_context_v1')) return { rows: [] };
          if (text.includes('begin_member_subject_context_v1')) return { rows: [{ subjectId: SUBJECT_ID, subjectKind: 'member' } as Row] };
          if (text.includes('select_approved_saju_checkout_v1')) {
            expect(values).toEqual([SUBJECT_ID, approved?.id, 'approved-checkout-1',
              approved?.counterpartOrder === undefined ? null : TARGET_PERSON_ID]);
            return { rows: input.unavailable ? [] : [{
              productOfferId: OFFER_ID, sajuRecordId: SAJU_RECORD_ID, birthRevisionId: BIRTH_REVISION_ID,
            } as Row] };
          }
          if (text.includes('qry_purchase_intent_runtime_snapshot_v3')) {
            expect(values).toEqual([OFFER_ID]);
            return { rows: [{
              productOfferId: OFFER_ID,
              productId: PRODUCT_ID,
              platform: 'web',
              provider: approved === undefined ? 'testpay' : 'portone_v2',
              externalProductId: 'offer-web',
              capabilitySetId: CAPABILITY_SET_ID,
              capabilityDefinitionVersion: 'capability-v1',
              capabilityDefinitionHash: 'sha256:capability-v1',
            } as Row] };
          }
          if (text.includes('resolve_approved_purchase_admission_v1') && approved !== undefined) {
            expect(values?.slice(0, 6)).toEqual([SUBJECT_ID, SAJU_RECORD_ID, BIRTH_REVISION_ID,
              OFFER_ID, CAPABILITY_SET_ID, approved.id]);
            return { rows: [{ admission: {
              policy: 'approved-saju-2026-11-06', approvedOfferId: approved.id, subjectId: SUBJECT_ID,
              sajuRecordId: SAJU_RECORD_ID, birthRevisionId: BIRTH_REVISION_ID, productOfferId: OFFER_ID,
              capabilitySetId: CAPABILITY_SET_ID, amountMinor: approved.priceKrw, currency: 'KRW',
              components: approved.components.map(component => ({
                component, authority: 'official_fulfillment', releaseRef: 'isolated-release',
              })),
              ...(approved.components.some(component => component === 'year' || component === 'month')
                ? { periodReferenceDateTime: PERIOD } : {}),
              ...(approved.counterpartOrder === undefined ? {} : { counterpart: {
                targetPersonId: TARGET_PERSON_ID, targetBirthRevisionId: TARGET_REVISION_ID,
                order: approved.counterpartOrder, useApprovalRef: 'isolated-use',
              } }),
            } } as Row] };
          }
          if (text.includes('create_approved_purchase_intent_v1') && approved !== undefined) {
            if (input.commandConstraint !== undefined) {
              throw Object.assign(new Error('private database detail'), { constraint: input.commandConstraint });
            }
            const admission = JSON.parse(values?.[11] as string);
            expect(admission.approvedOfferId).toBe(approved.id);
            expect(admission.amountMinor).toBe(approved.priceKrw);
            return { rows: [{
              purchaseIntentId: PURCHASE_INTENT_ID, productOfferId: OFFER_ID, providerAccountLinkId: null, status: 'created',
              offerSnapshotJsonb: JSON.parse(values?.[7] as string), offerSnapshotHash: values?.[8],
              expectedAmountMinor: String(approved.priceKrw), expectedCurrency: 'KRW', chargeTermsVersion: 'charge-v1',
              capabilitySetId: CAPABILITY_SET_ID, capabilitySnapshotJsonb: JSON.parse(values?.[9] as string),
              capabilitySnapshotHash: values?.[10], replayed: false, approvedSajuAdmissionHash: values?.[12],
            } as Row] };
          }
          if (text.includes('cmd_create_purchase_intent_v3')) {
            if (input.commandConstraint !== undefined) {
              throw Object.assign(new Error('private database detail'), { constraint: input.commandConstraint, code: '23505' });
            }
            const offerSnapshot = JSON.parse(values?.[6] as string);
            const capabilitySnapshot = JSON.parse(values?.[8] as string);
            return { rows: [{
              purchaseIntentId: PURCHASE_INTENT_ID,
              productOfferId: OFFER_ID,
              providerAccountLinkId: null,
              status: 'created',
              offerSnapshotJsonb: offerSnapshot,
              offerSnapshotHash: values?.[7],
              expectedAmountMinor: '12900',
              expectedCurrency: 'KRW',
              chargeTermsVersion: 'charge-v1',
              capabilitySetId: CAPABILITY_SET_ID,
              capabilitySnapshotJsonb: capabilitySnapshot,
              capabilitySnapshotHash: values?.[9],
              replayed: false,
            } as Row] };
          }
          throw new Error(`Unexpected SQL in Purchase Intent v3 HTTP test: ${text}`);
        },
        release: vi.fn(),
      };
    },
  };
}

function invoke(input: { request?: Request; evidence?: VerifiedSubjectIdentityEvidenceV1 | null; pool?: PostgresSubjectPoolV1; approved?: true } = {}) {
  return handlePurchaseIntentCreateRequestV3({
    request: input.request ?? post({ productOfferId: OFFER_ID, idempotencyKey: 'checkout-1' }),
    requestId: 'req-purchase-intent-v3',
    serverTime: '2026-09-17T12:00:00.000Z',
    identityEvidenceVerifier: verifier(input.evidence === undefined ? { kind: 'member', verifiedAuthUserId: AUTH_USER_ID } : input.evidence),
    pool: input.pool ?? fakePool(),
    idPort: { nextPurchaseIntentId: vi.fn(async () => PURCHASE_INTENT_ID) },
    ...(input.approved === true ? { privateApprovedSajuCheckoutEnabled: true } : {}),
  });
}

describe('Purchase Intent v3 HTTP runtime foundation', () => {
  it.each(['career', 'basic-year-month', 'additional-counterpart'])(
    'resolves %s using only the member-owned database scope and the approved charge', async (catalogId) => {
      const queriedSql: string[] = [];
      const response = await invoke({
        approved: true, pool: fakePool({ queriedSql, catalogId }),
        request: post({
          approvedOfferId: catalogId, idempotencyKey: 'approved-checkout-1',
          ...(catalogId === 'additional-counterpart' ? { targetPersonId: TARGET_PERSON_ID } : {}),
        }),
      });
      expect(response.status).toBe(200);
      const payload = await response.json() as { data: unknown };
      expect(payload.data).toEqual({ purchaseIntentId: PURCHASE_INTENT_ID, status: 'created',
        approvedOfferId: catalogId, amountMinor: getApprovedSajuOfferV1(catalogId)?.priceKrw, currency: 'KRW' });
      expect(queriedSql.some(sql => sql.includes('cmd_create_purchase_intent_v3'))).toBe(false);
      expect(JSON.stringify(payload)).not.toContain(BIRTH_REVISION_ID);
      expect(JSON.stringify(payload)).not.toContain(TARGET_REVISION_ID);
      expect(queriedSql.at(-1)).toBe('COMMIT');
    },
  );

  it('rejects client payment and birth authority, and keeps the catalog mode off by default', async () => {
    const connect = vi.fn(async () => { throw new Error('must not connect'); });
    const request = { approvedOfferId: 'career', idempotencyKey: 'approved-checkout-1' };
    expect((await invoke({ request: post(request), pool: { connect } })).status).toBe(400);
    for (const unsupported of [
      { productOfferId: OFFER_ID }, { amountMinor: 1 }, { birthRevisionId: BIRTH_REVISION_ID },
      { targetPersonId: TARGET_PERSON_ID },
    ]) {
      expect((await invoke({ approved: true, request: post({ ...request, ...unsupported }), pool: { connect } }))
        .status).toBe(400);
    }
    expect(connect).not.toHaveBeenCalled();
  });

  it('does not fall through to a legacy intent when the approved scope is unavailable or the price case changed', async () => {
    for (const input of [
      { unavailable: true }, { commandConstraint: 'approved_saju_counterpart_order_unavailable' },
    ]) {
      const queriedSql: string[] = [];
      const response = await invoke({
        approved: true, pool: fakePool({ ...input, catalogId: 'additional-counterpart', queriedSql }),
        request: post({ approvedOfferId: 'additional-counterpart', targetPersonId: TARGET_PERSON_ID,
          idempotencyKey: 'approved-checkout-1' }),
      });
      expect(response.status).toBe(404);
      expect(queriedSql.some(sql => sql.includes('cmd_create_purchase_intent_v3'))).toBe(false);
      expect(queriedSql.at(-1)).toBe('ROLLBACK');
    }
  });

  it('requires verified identity before parsing body or connecting PostgreSQL', async () => {
    const connect = vi.fn(async () => { throw new Error('must not connect'); });
    const request = new Request('https://myeongha.internal/internal-not-publicly-mounted', {
      method: 'POST',
      headers: { Authorization: 'Bearer bad' },
      body: '{not-json',
    });
    const response = await invoke({ request, evidence: null, pool: { connect } });
    expect(response.status).toBe(401);
    expect(connect).not.toHaveBeenCalled();
  });

  it('requires Member login for paid Purchase Intent and rejects Guest before PostgreSQL', async () => {
    const connect = vi.fn(async () => { throw new Error('must not connect'); });
    const response = await invoke({
      evidence: { kind: 'guest', verifiedGuestTokenHash: 'sha256:guest-session-fingerprint' },
      pool: { connect },
    });
    const payload = await response.json() as any;
    expect(response.status).toBe(403);
    expect(payload.error).toEqual({
      code: 'LOGIN_REQUIRED',
      messageKey: 'purchase_intent.login_required',
      retryable: false,
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects caller authority injection before opening PostgreSQL', async () => {
    const connect = vi.fn(async () => { throw new Error('must not connect'); });
    const response = await invoke({
      request: post({ productOfferId: OFFER_ID, idempotencyKey: 'checkout-1', subjectId: SUBJECT_ID, expectedAmountMinor: 1 }),
      pool: { connect },
    });
    expect(response.status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
  });

  it('uses one immutable snapshot query and the governed v3 command only', async () => {
    const queriedSql: string[] = [];
    const response = await invoke({ pool: fakePool({ queriedSql }) });
    const payload = await response.json() as any;
    expect(response.status).toBe(200);
    expect(payload.data).toEqual({ purchaseIntentId: PURCHASE_INTENT_ID, status: 'created' });
    expect(queriedSql.filter((sql) => sql.includes('qry_purchase_intent_runtime_snapshot_v3'))).toHaveLength(1);
    expect(queriedSql.filter((sql) => sql.includes('cmd_create_purchase_intent_v3'))).toHaveLength(1);
    expect(queriedSql.some((sql) => /insert\s+into\s+public\.(purchase_intents|product_offers)/iu.test(sql))).toBe(false);
    expect(JSON.stringify(payload)).not.toContain(SUBJECT_ID);
    expect(JSON.stringify(payload)).not.toContain('expectedAmountMinor');
    expect(JSON.stringify(payload)).not.toContain('capabilitySetId');
  });

  it('maps idempotency conflicts without leaking PostgreSQL detail', async () => {
    const response = await invoke({ pool: fakePool({ commandConstraint: 'cmd_purchase_intent_v3_idempotency_conflict' }) });
    const payload = await response.json() as any;
    expect(response.status).toBe(409);
    expect(payload.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(JSON.stringify(payload)).not.toContain('private database detail');
  });
});
