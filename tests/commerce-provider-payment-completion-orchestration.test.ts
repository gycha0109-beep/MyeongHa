import { describe, expect, it, vi } from 'vitest';
import {
  executeAuthenticatedCommerceProviderPaymentCompletionV1,
  type CommerceProviderIngressAuthenticatorV1,
} from '../apps/api/src/commerce-provider-payment-completion-orchestration.js';
import type { CommercePaymentVerificationAdapterV1 } from '../apps/api/src/commerce-payment-verification-execution.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const PAYMENT_ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const PURCHASE_INTENT_ID = '33333333-3333-4333-8333-333333333333';
const RECEIPT_ID = '44444444-4444-4444-8444-444444444444';
const PROVIDER_EVENT_ID = '55555555-5555-4555-8555-555555555555';

function verifiedEvidence(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'commerce-evidence-v2',
    provider: 'provider-test',
    platform: 'web',
    environment: 'sandbox',
    externalTransactionId: 'transaction-1',
    externalProductId: 'external-product-1',
    currentState: 'active',
    ownerBinding: {
      kind: 'purchase_intent',
      purchaseIntentId: PURCHASE_INTENT_ID,
    },
    evidenceFingerprint: `hmac-sha256:k1:${'a'.repeat(64)}`,
    verifierRevision: 'test-verifier-v1',
    verifiedAmountMinor: 1000,
    verifiedCurrency: 'KRW',
    verifiedAt: '2026-09-14T00:00:00.000Z',
    ...overrides,
  };
}

function makeHarness(options: {
  readonly expectedProviderTransactionId?: string;
  readonly replayed?: boolean;
  readonly persistError?: unknown;
} = {}) {
  const events: string[] = [];
  const contextCalls: Array<readonly unknown[]> = [];
  const persistCalls: Array<readonly unknown[]> = [];
  let connectionCount = 0;

  const connect = vi.fn(async () => {
    connectionCount += 1;
    const connectionNumber = connectionCount;
    events.push(`connect:${connectionNumber}`);

    const query = vi.fn(async (text: string, values?: readonly unknown[]) => {
      if (text === 'BEGIN') {
        events.push(`begin:${connectionNumber}`);
        return { rows: [] };
      }
      if (text === 'SET LOCAL ROLE myeongha_commerce_internal_executor') {
        events.push(`role:${connectionNumber}`);
        return { rows: [] };
      }
      if (text === 'COMMIT') {
        events.push(`commit:${connectionNumber}`);
        return { rows: [] };
      }
      if (text === 'ROLLBACK') {
        events.push(`rollback:${connectionNumber}`);
        return { rows: [] };
      }
      if (text.includes('qry_commerce_provider_payment_verification_context_v1')) {
        events.push(`context:${connectionNumber}`);
        contextCalls.push(values ?? []);
        return {
          rows: [
            {
              paymentAttemptId: PAYMENT_ATTEMPT_ID,
              resolvedSubjectId: SUBJECT_ID,
              purchaseIntentId: PURCHASE_INTENT_ID,
              provider: 'provider-test',
              platform: 'web',
              environment: 'sandbox',
              providerRequestId: 'request-1',
              expectedProviderTransactionId:
                options.expectedProviderTransactionId ?? null,
              expectedExternalProductId: 'external-product-1',
              expectedAmountMinor: '1000',
              expectedCurrency: 'KRW',
            },
          ],
        };
      }
      if (text.includes('cmd_persist_verified_payment_evidence_v1')) {
        events.push(`persist:${connectionNumber}`);
        persistCalls.push(values ?? []);
        if (options.persistError !== undefined) throw options.persistError;
        return {
          rows: [
            {
              receiptId: RECEIPT_ID,
              providerEventId: PROVIDER_EVENT_ID,
              replayed: options.replayed ?? false,
            },
          ],
        };
      }
      throw new Error(`Unexpected SQL: ${text}`);
    });

    const release = vi.fn((error?: unknown) => {
      events.push(`release:${connectionNumber}:${error === undefined ? 'ok' : 'error'}`);
    });

    return { query, release };
  });

  return {
    pool: { connect } as unknown as PostgresSubjectPoolV1,
    connect,
    events,
    contextCalls,
    persistCalls,
  };
}

function authenticatorFor(
  events: string[],
  result: unknown,
): CommerceProviderIngressAuthenticatorV1 {
  return {
    authenticate: vi.fn(async () => {
      events.push('authenticate');
      return result;
    }),
  };
}

describe('authenticated provider payment completion orchestration', () => {
  it('commits context resolution before provider verification and uses a distinct persistence transaction', async () => {
    const harness = makeHarness();
    const authenticator = authenticatorFor(harness.events, {
      provider: 'provider-test',
      environment: 'sandbox',
      providerRequestId: 'request-1',
    });
    const verificationAdapter: CommercePaymentVerificationAdapterV1 = {
      verify: vi.fn(async (context) => {
        harness.events.push('verify');
        expect(harness.events).toContain('commit:1');
        expect(harness.events).toContain('release:1:ok');
        expect(harness.events).not.toContain('connect:2');
        expect(context).toEqual({
          provider: 'provider-test',
          platform: 'web',
          environment: 'sandbox',
          providerRequestId: 'request-1',
          purchaseIntentId: PURCHASE_INTENT_ID,
          expectedExternalProductId: 'external-product-1',
          expectedAmountMinor: 1000,
          expectedCurrency: 'KRW',
        });
        return {
          providerRequestId: 'request-1',
          evidence: verifiedEvidence(),
        };
      }),
    };

    const result = await executeAuthenticatedCommerceProviderPaymentCompletionV1({
      pool: harness.pool,
      ingress: { opaque: 'provider-transport' },
      authenticator,
      verificationAdapter,
    });

    expect(result).toEqual({
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      receiptId: RECEIPT_ID,
      providerEventId: PROVIDER_EVENT_ID,
      replayed: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(harness.events).toEqual([
      'authenticate',
      'connect:1',
      'begin:1',
      'role:1',
      'context:1',
      'commit:1',
      'release:1:ok',
      'verify',
      'connect:2',
      'begin:2',
      'role:2',
      'persist:2',
      'commit:2',
      'release:2:ok',
    ]);
    expect(harness.contextCalls[0]).toEqual([
      'provider-test',
      'sandbox',
      'request-1',
      null,
    ]);
    expect(harness.persistCalls[0]?.[0]).toBe(PAYMENT_ATTEMPT_ID);
    expect(harness.persistCalls[0]?.[1]).toBe(PURCHASE_INTENT_ID);
  });

  it('fails closed on authenticator rejection before any Commerce DB or provider verification work', async () => {
    const harness = makeHarness();
    const authenticator: CommerceProviderIngressAuthenticatorV1 = {
      authenticate: vi.fn(async () => {
        throw new Error('provider secret diagnostic');
      }),
    };
    const verificationAdapter: CommercePaymentVerificationAdapterV1 = {
      verify: vi.fn(),
    };

    const promise = executeAuthenticatedCommerceProviderPaymentCompletionV1({
      pool: harness.pool,
      ingress: {},
      authenticator,
      verificationAdapter,
    });

    await expect(promise).rejects.toMatchObject({
      name: 'ApiCommandError',
      code: 'AUTH_REQUIRED',
    });
    await expect(promise).rejects.not.toThrow(/provider secret diagnostic/u);
    expect(harness.connect).not.toHaveBeenCalled();
    expect(verificationAdapter.verify).not.toHaveBeenCalled();
  });

  it('rejects authenticated ingress that attempts to inject subject authority', async () => {
    const harness = makeHarness();
    const verificationAdapter: CommercePaymentVerificationAdapterV1 = {
      verify: vi.fn(),
    };

    await expect(
      executeAuthenticatedCommerceProviderPaymentCompletionV1({
        pool: harness.pool,
        ingress: {},
        authenticator: authenticatorFor(harness.events, {
          provider: 'provider-test',
          environment: 'sandbox',
          providerRequestId: 'request-1',
          subjectId: SUBJECT_ID,
        }),
        verificationAdapter,
      }),
    ).rejects.toMatchObject({ name: 'ApiCommandError', code: 'AUTH_REQUIRED' });

    expect(harness.connect).not.toHaveBeenCalled();
    expect(verificationAdapter.verify).not.toHaveBeenCalled();
  });

  it('supports transaction-only authenticated lookup identity without caller-selected Commerce authority', async () => {
    const harness = makeHarness({ expectedProviderTransactionId: 'transaction-1' });
    const verificationAdapter: CommercePaymentVerificationAdapterV1 = {
      verify: vi.fn(async (context) => ({
        providerRequestId: context.providerRequestId,
        evidence: verifiedEvidence(),
      })),
    };

    await executeAuthenticatedCommerceProviderPaymentCompletionV1({
      pool: harness.pool,
      ingress: {},
      authenticator: authenticatorFor(harness.events, {
        provider: 'provider-test',
        environment: 'sandbox',
        providerTransactionId: 'transaction-1',
      }),
      verificationAdapter,
    });

    expect(harness.contextCalls[0]).toEqual([
      'provider-test',
      'sandbox',
      null,
      'transaction-1',
    ]);
    expect(verificationAdapter.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        providerRequestId: 'request-1',
        expectedProviderTransactionId: 'transaction-1',
      }),
    );
  });

  it('does not open the persistence transaction when provider verification fails', async () => {
    const harness = makeHarness();
    const verificationAdapter: CommercePaymentVerificationAdapterV1 = {
      verify: vi.fn(async () => ({
        providerRequestId: 'request-1',
        evidence: verifiedEvidence({ provider: 'provider-other' }),
      })),
    };

    await expect(
      executeAuthenticatedCommerceProviderPaymentCompletionV1({
        pool: harness.pool,
        ingress: {},
        authenticator: authenticatorFor(harness.events, {
          provider: 'provider-test',
          environment: 'sandbox',
          providerRequestId: 'request-1',
        }),
        verificationAdapter,
      }),
    ).rejects.toMatchObject({
      name: 'CommercePaymentVerificationErrorV1',
      code: 'PROVIDER_MISMATCH',
    });

    expect(harness.connect).toHaveBeenCalledTimes(1);
    expect(harness.events).not.toContain('connect:2');
  });

  it('surfaces exact replay from the final persistence authority', async () => {
    const harness = makeHarness({ replayed: true });
    const result = await executeAuthenticatedCommerceProviderPaymentCompletionV1({
      pool: harness.pool,
      ingress: {},
      authenticator: authenticatorFor(harness.events, {
        provider: 'provider-test',
        environment: 'sandbox',
        providerRequestId: 'request-1',
      }),
      verificationAdapter: {
        verify: vi.fn(async () => ({
          providerRequestId: 'request-1',
          evidence: verifiedEvidence(),
        })),
      },
    });

    expect(result.replayed).toBe(true);
    expect(result.receiptId).toBe(RECEIPT_ID);
    expect(result.providerEventId).toBe(PROVIDER_EVENT_ID);
  });

  it('fails closed on authority drift detected by the final persistence transaction', async () => {
    const harness = makeHarness({
      persistError: {
        constraint: 'cmd_persist_verified_payment_evidence_v1_attempt_state_ineligible',
      },
    });

    await expect(
      executeAuthenticatedCommerceProviderPaymentCompletionV1({
        pool: harness.pool,
        ingress: {},
        authenticator: authenticatorFor(harness.events, {
          provider: 'provider-test',
          environment: 'sandbox',
          providerRequestId: 'request-1',
        }),
        verificationAdapter: {
          verify: vi.fn(async () => ({
            providerRequestId: 'request-1',
            evidence: verifiedEvidence(),
          })),
        },
      }),
    ).rejects.toMatchObject({ name: 'ApiCommandError', code: 'NOT_FOUND' });

    expect(harness.events).toContain('rollback:2');
    expect(harness.events).not.toContain('commit:2');
  });
});
