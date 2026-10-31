import { describe, expect, it, vi } from 'vitest';
import {
  DIGITAL_READING_WITHDRAWAL_PRIVATE_TRANSACTION_V1,
  inspectDigitalReadingWithdrawalPrivateV1,
} from '../apps/api/src/commerce-digital-reading-withdrawal-private-transaction-v1.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const SUBJECT = '00000000-0000-4000-8000-000000000001';
const INTENT = '00000000-0000-4000-8000-000000000002';
const UNIT = '00000000-0000-4000-8000-000000000003';
const REQUEST = { purchaseIntentId: INTENT, unitId: UNIT, reason: 'change_of_mind' };
const DENIED = Object.freeze({
  kind: 'not_admitted', requestRecorded: false,
  providerRefundAuthorized: false, entitlementMutationAuthorized: false,
});
const PAID_ROW = {
  subjectId: SUBJECT, purchaseIntentId: INTENT, unitId: UNIT,
  productSpecVersion: 'standard-v1',
};
const NOTICE_ROW = {
  purchaseIntentId: INTENT, unitId: UNIT, productSpecVersion: 'standard-v1',
  noticeRevision: 'approved-v1', previewOrInformationRevision: 'preview-v1',
};

function fixture(failure?: 'connect' | 'begin' | 'read' | 'notice' | 'rollback' | 'release') {
  const calls: string[] = [];
  const release = vi.fn((error?: unknown) => {
    calls.push('RELEASE');
    if (failure === 'release') throw Error('private release error');
    void error;
  });
  const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    if (sql === 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY') {
      calls.push('BEGIN'); if (failure === 'begin') throw Error('private begin error');
      return { rows: [] };
    }
    if (sql === 'ROLLBACK') {
      calls.push('ROLLBACK'); if (failure === 'rollback') throw Error('private rollback error');
      return { rows: [] };
    }
    calls.push('SELECT');
    if (failure === 'read' || (failure === 'notice' && values?.length === 4)) {
      throw Error('private source detail');
    }
    if (!/select\s/i.test(sql)) throw Error('Unexpected mutation');
    return { rows: values?.length === 3 ? [PAID_ROW] : [NOTICE_ROW] };
  });
  const connect = vi.fn(async () => {
    if (failure === 'connect') throw Error('private credential unavailable');
    return { query, release };
  });
  const pool = { connect } as unknown as PostgresSubjectPoolV1;
  return { pool, calls, release, query, connect };
}

describe('private rollback-only Digital Reading refund triage transaction', () => {
  it('has no public route or request persistence authority', () => {
    expect(DIGITAL_READING_WITHDRAWAL_PRIVATE_TRANSACTION_V1).toMatchObject({
      isolation: 'repeatable_read',
      readonly: true, rollbackOnly: true,
      publicRouteMounted: false, requestPersistenceEnabled: false,
    });
  });

  it('reads one coherent snapshot, never commits, always rolls back', async () => {
    const { pool, calls, release } = fixture();
    const result = await inspectDigitalReadingWithdrawalPrivateV1({
      pool, resolvedSubjectId: SUBJECT, request: REQUEST,
    });
    expect(calls).toEqual(['BEGIN', 'SELECT', 'SELECT', 'ROLLBACK', 'RELEASE']);
    expect(release).toHaveBeenCalledWith(undefined);
    expect(result).toMatchObject({
      kind: 'manual_review_candidate',
      review: { classification: 'evidence_review_required' },
      requestRecorded: false, entitlementMutationAuthorized: false,
      providerRefundAuthorized: false,
    });
  });

  it.each(['connect', 'begin', 'read', 'notice', 'rollback', 'release'] as const)(
    'contains %s failures without reporting recorded claim or leaking raw errors',
    async (failure) => {
      const { pool, calls, release } = fixture(failure);
      const result = await inspectDigitalReadingWithdrawalPrivateV1({
        pool, resolvedSubjectId: SUBJECT, request: REQUEST,
      });
      expect(result).toEqual(DENIED);
      expect(JSON.stringify(result)).not.toContain('private');
      expect(calls).not.toContain('COMMIT');
      if (failure === 'rollback' || failure === 'begin') {
        expect(release).toHaveBeenCalledWith(expect.any(Error));
      }
    },
  );

  it('rejects untrusted request yet still closes read-only transaction', async () => {
    const { pool, calls } = fixture();
    expect(await inspectDigitalReadingWithdrawalPrivateV1({
      pool, resolvedSubjectId: SUBJECT,
      request: { ...REQUEST, refundApproved: true },
    })).toEqual(DENIED);
    expect(calls).toEqual(['BEGIN', 'ROLLBACK', 'RELEASE']);
  });

  it('does not synthesize successful delivery evidence from a verified payment', async () => {
    const { pool } = fixture();
    const result = await inspectDigitalReadingWithdrawalPrivateV1({
      pool, resolvedSubjectId: SUBJECT, request: REQUEST,
    });
    expect(result).toMatchObject({
      kind: 'manual_review_candidate',
      review: { classification: 'evidence_review_required' },
    });
    expect(result).not.toHaveProperty('deliveredAt');
    expect(result).not.toHaveProperty('receiptId');
  });
});
