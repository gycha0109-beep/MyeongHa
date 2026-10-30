import { describe, expect, it, vi } from 'vitest';
import {
  DIGITAL_READING_WITHDRAWAL_PRIVATE_INTAKE_V1,
  recordPrivateDigitalReadingWithdrawalClaimCandidateV1,
} from '../apps/api/src/commerce-digital-reading-withdrawal-private-intake-v1.js';
import type {
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';

const SUBJECT = '00000000-0000-4000-8000-000000000001';
const PURCHASE = '00000000-0000-4000-8000-000000000002';
const UNIT = '00000000-0000-4000-8000-000000000003';
const KEY = '00000000-0000-4000-8000-000000000004';
const CLAIM = '00000000-0000-4000-8000-000000000005';
const SECRET = 'synthetic-test-secret-with-more-than-32-bytes';
const REQUEST = {
  purchaseIntentId: PURCHASE,
  unitId: UNIT,
  reason: 'change_of_mind',
  idempotencyKey: KEY,
};
const PAID = {
  subjectId: SUBJECT,
  purchaseIntentId: PURCHASE,
  unitId: UNIT,
  productSpecVersion: 'standard-v1',
};
const NOTICE = {
  purchaseIntentId: PURCHASE,
  unitId: UNIT,
  productSpecVersion: 'standard-v1',
  noticeRevision: 'approved-notice-v1',
  previewOrInformationRevision: 'approved-preview-v1',
};
type MockOptions = {
  firstInsert?: boolean;
  mismatchedReplay?: boolean;
  fail?: 'begin'|'authority'|'paid'|'notice'|'insert'|'replay'|'commit'|'rollback';
  incompleteVisibility?: boolean;
};
function fakeDb(options: MockOptions = {}) {
  const calls: Array<{ sql: string; values?: readonly unknown[] | undefined }> = [];
  const release = vi.fn();
  let insertedRow: Record<string, unknown> | undefined;
  const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    calls.push({sql, values});
    if (sql.startsWith('BEGIN')) {
      if (options.fail === 'begin') throw Error('private begin failure');
      return {rows: []};
    }
    if (sql === 'ROLLBACK') {
      if (options.fail === 'rollback') throw Error('private rollback failure');
      return {rows: []};
    }
    if (sql === 'COMMIT') {
      if (options.fail === 'commit') throw Error('private commit ambiguous');
      return {rows: []};
    }
    if (sql.includes('pg_catalog.pg_roles')) {
      if (options.fail === 'authority') throw Error('private role failure');
      return {rows: [{
        readOnly: false,completeVisibility:!options.incompleteVisibility,
      }]};
    }
    if (sql.includes('select\n  pi.subject_id::text')) {
      if (options.fail === 'paid') throw Error('private DB lookup failure');
      return {rows: [PAID]};
    }
    if (sql.includes('digital_reading_checkout_notice_presentations_v1 p')) {
      if (options.fail === 'notice') throw Error('private notice lookup failure');
      return {rows: [NOTICE]};
    }
    if (sql.startsWith('insert into public.digital_reading_withdrawal_claims_private_v1')) {
      if (options.fail === 'insert') throw Error('private SQL insert failure');
      const row = {
        id: CLAIM,
        subjectId: SUBJECT,
        purchaseIntentId: PURCHASE,
        unitId: UNIT,
        reasonCode: REQUEST.reason,
        idempotencyHmac: values?.[4],
        requestHash: values?.[5],
        contractVersion: 'digital-reading-withdrawal-claim-v1',
      };
      insertedRow = row;
      return {rows: options.firstInsert === false ? [] : [row]};
    }
    if (sql.includes('from public.digital_reading_withdrawal_claims_private_v1')) {
      if (options.fail === 'replay') throw Error('private SQL replay failure');
      return {rows: insertedRow === undefined ? [] : [{
        ...insertedRow,
        ...(options.mismatchedReplay ? {unitId:'00000000-0000-4000-8000-000000000088'} : {}),
      }]};
    }
    throw Error('Unexpected query');
  });
  const connect = vi.fn(async () => ({query,release}));
  return {pool: {connect} as unknown as PostgresSubjectPoolV1,
    query,release,connect,calls};
}
function call(pool: PostgresSubjectPoolV1, overrides: Record<string, unknown> = {}) {
  return recordPrivateDigitalReadingWithdrawalClaimCandidateV1({
    pool,
    resolvedSubjectId: SUBJECT,
    request: REQUEST,
    claimDispositionGraphIntegrated: true,
    privateOperationsIntakeApproved: true,
    idempotencyHmacSecret: SECRET,
    ...overrides,
  });
}

describe('private unmounted withdrawal claim intake candidate', () => {
  it('does not activate public checkout, customer receipt, refund or revocation', () => {
    expect(DIGITAL_READING_WITHDRAWAL_PRIVATE_INTAKE_V1).toEqual({
      productionMounted:false,publicRouteMounted:false,
      accountDeletionPolicyDecided:true,
      claimDispositionGraphIntegrated:false,
      consumerAcknowledgmentEnabled:false,
      providerRefundEnabled:false,
      entitlementMutationEnabled:false,
    });
  });

  it.each([
    {claimDispositionGraphIntegrated:false},
    {privateOperationsIntakeApproved:false},
  ])('requires private intake and existing-policy graph integration: %j', async override => {
    const {pool,connect} = fakeDb();
    expect(await call(pool,override)).toMatchObject({
      kind:'not_activated',requestRecorded:false,
      consumerAcknowledgmentIssued:false,
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it('commits exactly one immutable private claim for an exact owned paid reading', async () => {
    const {pool,calls,release} = fakeDb();
    const result = await call(pool);
    expect(result).toEqual({
      kind:'stored_private_claim', replayed:false,
      requestRecorded:true,consumerAcknowledgmentIssued:false,
      providerRefundAuthorized:false,entitlementMutationAuthorized:false,
    });
    expect(calls.map(c=>c.sql.startsWith('BEGIN')?'BEGIN':c.sql==='COMMIT'?'COMMIT':
      c.sql==='ROLLBACK'?'ROLLBACK':'QUERY')).toEqual([
      'BEGIN','QUERY','QUERY','QUERY','QUERY','COMMIT',
    ]);
    const insert = calls.find(c=>c.sql.startsWith('insert into'));
    expect(insert).toBeDefined();
    expect(insert?.sql).toContain('on conflict (subject_id,idempotency_hmac) do nothing');
    expect(insert?.values?.[4]).toMatch(/^hmac-sha256:k1:[0-9a-f]{64}$/);
    expect(insert?.values?.[5]).toMatch(/^sha256:v1:[0-9a-f]{64}$/);
    expect(calls[0]?.sql).toContain('SERIALIZABLE');
    expect(release).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveProperty('claimId');
    expect(result).not.toHaveProperty('customerName');
  });

  it('recognizes replay only when the stored claim matches exact immutable semantics', async () => {
    const {pool,calls} = fakeDb({firstInsert:false});
    const result = await call(pool);
    expect(result).toMatchObject({
      kind:'stored_private_claim',replayed:true,requestRecorded:true,
    });
    expect(calls.at(-1)?.sql).toBe('COMMIT');
  });

  it('rejects reuse of an idempotency key for a conflicting unit', async () => {
    const {pool,calls} = fakeDb({firstInsert:false,mismatchedReplay:true});
    expect(await call(pool)).toMatchObject({
      kind:'not_admitted',requestRecorded:false,
    });
    expect(calls.at(-1)?.sql).toBe('ROLLBACK');
  });

  it.each([
    {request:{...REQUEST,subjectId:SUBJECT}},
    {request:{...REQUEST,reason:'no_refund'}},
    {request:{...REQUEST,idempotencyKey:'short'}},
    {idempotencyHmacSecret:'weak'},
    {resolvedSubjectId:'bad'},
    {request:{...REQUEST,unitId:'not-a-uuid'}},
  ])('never touches DB for malformed or authority-injecting input: %j', async overrides => {
    const {pool,connect} = fakeDb();
    expect(await call(pool,overrides)).toMatchObject({
      kind:'not_admitted', requestRecorded:false,
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects incomplete operations database visibility before reading/payment writes', async () => {
    const {pool,calls} = fakeDb({incompleteVisibility:true});
    expect(await call(pool)).toMatchObject({kind:'not_admitted'});
    expect(calls.map(c=>c.sql)).toEqual([
      'BEGIN ISOLATION LEVEL SERIALIZABLE',
      expect.stringContaining('pg_catalog.pg_roles'),'ROLLBACK',
    ]);
  });

  it.each(['begin','authority','paid','notice','insert','replay'] as const)(
    'contains %s failures and returns no positive claim acceptance',
    async fail => {
      const {pool,calls,release} = fakeDb({
        fail,...(fail==='replay'?{firstInsert:false}:{})
      });
      const result = await call(pool);
      expect(result.kind).toBe('not_admitted');
      expect(result.requestRecorded).toBe(false);
      expect(JSON.stringify(result)).not.toContain('private');
      expect(calls.some(c=>c.sql==='COMMIT')).toBe(false);
      expect(calls.at(-1)?.sql).toBe('ROLLBACK');
      expect(release).toHaveBeenCalledTimes(1);
    },
  );
});

describe('ambiguous private intake commit result', () => {
  it('never reports a confirmed non-recording after COMMIT transport failure', async () => {
    const {pool,calls,release} = fakeDb({fail:'commit'});
    const result = await call(pool);
    expect(result).toEqual({
      kind:'outcome_unknown',
      requestRecorded:'unknown',
      consumerAcknowledgmentIssued:false,
      providerRefundAuthorized:false,
      entitlementMutationAuthorized:false,
    });
    expect(calls.some(c=>c.sql==='COMMIT')).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('a database rollback error never authorizes a refund or acceptance', async () => {
    const {pool} = fakeDb({fail:'rollback',incompleteVisibility:true});
    const result = await call(pool);
    expect(result).toMatchObject({
      kind:'not_admitted',
      requestRecorded:false,
      consumerAcknowledgmentIssued:false,
      providerRefundAuthorized:false,
    });
  });
});
