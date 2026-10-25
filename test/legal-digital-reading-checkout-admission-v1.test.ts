import { describe, expect, it, vi } from 'vitest';
import { createPostgresDigitalReadingCheckoutAdmissionPortV1,
  createPostgresDigitalReadingHandoffAdmissionPortV1,
  OWNED_DIGITAL_READING_CHECKOUT_READY_SQL_V1 } from '../apps/api/src/commerce-digital-reading-checkout-admission-v1.js';
import type { PostgresSubjectExecutionScopeV1 } from '../apps/api/src/postgres-subject-execution.js';

const OWNER='22222222-2222-4222-8222-222222222222';
const INTENT='33333333-3333-4333-8333-333333333333';
const scope=(ready: unknown, rows = 1) => {
  const query=vi.fn(async (_sql: string, _params?: readonly unknown[])=>({
    rows: Array.from({length:rows},()=>({ready})),
  }));
  return {
    subject: { resolvedSubject: {subjectId:OWNER, subjectKind:'member'},
      client:{query} } as unknown as PostgresSubjectExecutionScopeV1,
    query,
  };
};

describe('purchase-attempt real DB notice/ack gate', () => {
  it('calls the owner-bound lock and notice query only using trusted Subject', async () => {
    const s=scope(true);
    const gate=createPostgresDigitalReadingCheckoutAdmissionPortV1();
    await expect(gate.admit({scope:s.subject,purchaseIntentId:INTENT})).resolves.toBe(true);
    expect(OWNED_DIGITAL_READING_CHECKOUT_READY_SQL_V1)
      .toBe('public.qry_legal_digital_reading_checkout_ready_v1');
    expect(s.query).toHaveBeenCalledOnce();
    expect(s.query).toHaveBeenCalledWith(
      expect.stringContaining('qry_legal_digital_reading_checkout_ready_v1'),
      [OWNER,INTENT],
    );
  });
  it('denies false/absent/malformed notice and requires exactly one BOOLEAN DB witness', async () => {
    const gate=createPostgresDigitalReadingCheckoutAdmissionPortV1();
    expect(await gate.admit({scope:scope(false).subject,purchaseIntentId:INTENT})).toBe(false);
    await expect(gate.admit({scope:scope('true').subject,purchaseIntentId:INTENT}))
      .rejects.toThrow(/malformed proof/u);
    await expect(gate.admit({scope:scope(true,0).subject,purchaseIntentId:INTENT}))
      .rejects.toThrow(/malformed proof/u);
    await expect(gate.admit({scope:scope(true,2).subject,purchaseIntentId:INTENT}))
      .rejects.toThrow(/malformed proof/u);
  });
  it('re-checks the PSP handoff attempt against the same owner before releasing paymentId', async () => {
    const s=scope(true);
    const gate=createPostgresDigitalReadingHandoffAdmissionPortV1();
    await expect(gate.admit({scope:s.subject,paymentAttemptId:INTENT})).resolves.toBe(true);
    expect(s.query).toHaveBeenCalledWith(
      expect.stringContaining('qry_legal_digital_reading_handoff_ready_v1'),
      [OWNER,INTENT],
    );
    const s2=scope(false);
    await expect(gate.admit({scope:s2.subject,paymentAttemptId:INTENT}))
      .resolves.toBe(false);
    const malformed=scope('true');
    await expect(gate.admit({scope:malformed.subject,paymentAttemptId:INTENT}))
      .rejects.toThrow(/malformed proof/u);
  });

  it('does not touch the database for invalid or caller-mutable intent identifiers', async () => {
    const s=scope(true);
    await expect(createPostgresDigitalReadingCheckoutAdmissionPortV1()
      .admit({scope:s.subject,purchaseIntentId:'malformed'}))
      .rejects.toMatchObject({code:'INVALID_REQUEST'});
    await expect(createPostgresDigitalReadingHandoffAdmissionPortV1()
      .admit({scope:s.subject,paymentAttemptId:'not-a-uuid'}))
      .rejects.toMatchObject({code:'INVALID_REQUEST'});
    expect(s.query).not.toHaveBeenCalled();
  });
});
