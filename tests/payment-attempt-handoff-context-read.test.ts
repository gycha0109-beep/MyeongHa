import { describe, expect, it, vi } from 'vitest';
import { ApiCommandError } from '../apps/api/src/api-error.js';
import { loadPaymentAttemptHandoffContextV1 } from '../apps/api/src/payment-attempt-handoff-context-read.js';
import type { PostgresSubjectExecutionScopeV1 } from '../apps/api/src/postgres-subject-execution.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';

function makeScope(input: {
  rows?: readonly Record<string, unknown>[];
  error?: unknown;
}) {
  const query = vi.fn(async () => {
    if (input.error !== undefined) throw input.error;
    return { rows: input.rows ?? [] };
  });

  const scope = {
    resolvedSubject: { subjectId: SUBJECT_ID, subjectKind: 'member' },
    client: { query },
  } as unknown as PostgresSubjectExecutionScopeV1;

  return { scope, query };
}

function authorityRow(overrides: Record<string, unknown> = {}) {
  return {
    paymentAttemptId: ATTEMPT_ID,
    provider: 'portone_v2',
    environment: 'sandbox',
    providerRequestId: 'mha_pa_canonical-payment-id',
    expectedAmountMinor: '12900',
    expectedCurrency: 'KRW',
    status: 'created',
    providerTransactionId: 'must-never-be-projected-as-payment-id',
    ...overrides,
  };
}

describe('Payment Attempt handoff context read', () => {
  it('projects only persisted pre-browser handoff authority for the resolved Subject', async () => {
    const { scope, query } = makeScope({ rows: [authorityRow()] });

    await expect(
      loadPaymentAttemptHandoffContextV1({ scope, paymentAttemptId: ATTEMPT_ID }),
    ).resolves.toEqual({
      paymentAttemptId: ATTEMPT_ID,
      provider: 'portone_v2',
      environment: 'sandbox',
      providerRequestId: 'mha_pa_canonical-payment-id',
      amountMinor: 12900,
      currency: 'KRW',
      status: 'created',
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain(
      'public.qry_commerce_payment_attempt_handoff_context_v1($1::uuid, $2::uuid)',
    );
    expect(query.mock.calls[0]?.[0]).not.toContain('provider_transaction_id');
    expect(query.mock.calls[0]?.[1]).toEqual([SUBJECT_ID, ATTEMPT_ID]);
  });

  it('keeps the PortOne paymentId source distinct from provider transaction identity', async () => {
    const { scope } = makeScope({ rows: [authorityRow()] });
    const context = await loadPaymentAttemptHandoffContextV1({
      scope,
      paymentAttemptId: ATTEMPT_ID,
    });

    expect(context.providerRequestId).toBe('mha_pa_canonical-payment-id');
    expect(JSON.stringify(context)).not.toContain('must-never-be-projected-as-payment-id');
    expect(JSON.stringify(context)).not.toContain('providerTransactionId');
  });

  it('fails closed on unsafe monetary projection', async () => {
    const { scope } = makeScope({
      rows: [authorityRow({ expectedAmountMinor: '9007199254740992' })],
    });

    await expect(
      loadPaymentAttemptHandoffContextV1({ scope, paymentAttemptId: ATTEMPT_ID }),
    ).rejects.toThrow('unsafe amount');
  });

  it('maps missing, cross-Subject, and state-ineligible attempts to non-enumerating NOT_FOUND', async () => {
    for (const constraint of [
      'qry_commerce_payment_attempt_handoff_context_unavailable',
      'qry_commerce_payment_attempt_handoff_context_state_ineligible',
    ]) {
      const { scope } = makeScope({ error: { constraint } });
      try {
        await loadPaymentAttemptHandoffContextV1({
          scope,
          paymentAttemptId: ATTEMPT_ID,
        });
        throw new Error('expected handoff context read to fail');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiCommandError);
        expect((error as ApiCommandError).code).toBe('NOT_FOUND');
      }
    }
  });

  it('rejects invalid Payment Attempt identity before the authority query', async () => {
    const { scope, query } = makeScope({ rows: [authorityRow()] });

    await expect(
      loadPaymentAttemptHandoffContextV1({
        scope,
        paymentAttemptId: 'not-a-uuid',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(query).not.toHaveBeenCalled();
  });
});
