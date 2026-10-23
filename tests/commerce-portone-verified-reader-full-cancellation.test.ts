import { describe, expect, it, vi } from 'vitest';
import { applyVerifiedPortOneV2ReaderFullCancellationV1 } from '../apps/api/src/commerce-portone-verified-reader-full-cancellation.js';
import type { VerifiedPortOneV2FullCancellationV1 } from '../apps/api/src/portone-v2-payment-verification-adapter.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const RECEIPT = '11111111-1111-4111-8111-111111111111';
const EVENT = '22222222-2222-4222-8222-222222222222';
const GRANT = '33333333-3333-4333-8333-333333333333';
const ENTITLEMENT_EVENT = '44444444-4444-4444-8444-444444444444';
const OTHER_GRANT = '55555555-5555-4555-8555-555555555555';
const OTHER_ENTITLEMENT_EVENT = '66666666-6666-4666-8666-666666666666';
const evidence: VerifiedPortOneV2FullCancellationV1 = Object.freeze({
  paymentId: 'verified-payment',
  transactionId: 'verified-transaction',
  cancellationId: 'verified-full-cancel',
  environment: 'production',
  cancelledAt: '2026-10-21T00:00:00.000Z',
  verifiedAmountMinor: 1000,
  verifiedCurrency: 'KRW',
  evidenceFingerprint: `hmac-sha256:k1:${'a'.repeat(64)}`,
  verifierRevision: 'verified-owner-test',
});

function result(revoke: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return {
    contractVersion: 'portone-reader-full-cancellation-v1',
    receiptId: RECEIPT,
    providerEventId: EVENT,
    revoke,
  };
}

function mockCommercePool(dbResult: unknown) {
  const query = vi.fn(async (sql: string) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK'
        || sql === 'SET LOCAL ROLE myeongha_commerce_internal_executor') {
      return { rows: [] };
    }
    if (sql.includes('cmd_apply_verified_portone_reader_full_cancellation_v1(')) {
      return { rows: [{ result: dbResult }] };
    }
    throw new Error('Unexpected Commerce DB operation');
  });
  const release = vi.fn();
  const pool = { connect: vi.fn(async () => ({ query, release })) } as unknown as PostgresSubjectPoolV1;
  const statements = () => query.mock.calls.map(([sql]) => sql);
  return { pool, query, release, statements };
}

describe('verified PortOne Reader full cancellation DB result normalization', () => {
  it('COMMITS the actual 1900 no-Grant cancellation with one Receipt and Provider Event', async () => {
    const db = mockCommercePool(result({
      contractVersion: 'official-reader-s2-no-grant-cancellation-v1',
      disposition: 'cancelled_before_grant',
      scopeCount: 0,
      grantCount: 0,
    }));
    await expect(applyVerifiedPortOneV2ReaderFullCancellationV1({
      pool: db.pool, evidence,
    })).resolves.toEqual({
      kind: 'cancelled_before_grant',
      receiptId: RECEIPT,
      providerEventId: EVENT,
      grantCount: 0,
    });
    expect(db.statements()).toEqual([
      'BEGIN',
      'SET LOCAL ROLE myeongha_commerce_internal_executor',
      expect.stringContaining('cmd_apply_verified_portone_reader_full_cancellation_v1('),
      'COMMIT',
    ]);
    expect(db.release).toHaveBeenCalledWith(undefined);
  });

  it.each([
    'official-reader-s2-unbound-grant-cancellation-v1',
    'official-reader-s2-revoke-dispatch-v1',
  ])('preserves actual Grant revoke outcome for %s', async (contractVersion) => {
    const db = mockCommercePool(result({
      contractVersion,
      grantCount: 1,
      scopeCount: contractVersion === 'official-reader-s2-revoke-dispatch-v1' ? 1 : 0,
      effects: [contractVersion === 'official-reader-s2-revoke-dispatch-v1'
        ? {
            contractVersion:'official-reader-s2-provider-revoke-v1',
            scopeCount:1,grantId:GRANT,entitlementEventId:ENTITLEMENT_EVENT,
            replayed:false,
          }
        : {
            result_grant_id:GRANT,
            result_entitlement_event_id:ENTITLEMENT_EVENT,
            result_replayed:false,
          }],
      ...(contractVersion === 'official-reader-s2-revoke-dispatch-v1'
        ? { providerEventId: EVENT }
        : { disposition: 'cancelled_before_binding' }),
    }));
    await expect(applyVerifiedPortOneV2ReaderFullCancellationV1({
      pool: db.pool, evidence,
    })).resolves.toEqual({
      kind: 'revoked',
      receiptId: RECEIPT,
      providerEventId: EVENT,
      grantCount: 1,
    });
    expect(db.statements().at(-1)).toBe('COMMIT');
  });

  it.each([
    { contractVersion: 'official-reader-s2-unbound-grant-cancellation-v1', grantCount: 0 },
    { contractVersion: 'official-reader-s2-revoke-dispatch-v1', grantCount: 0 },
    { contractVersion: 'official-reader-s2-no-grant-cancellation-v1', grantCount: 0, scopeCount: 1, disposition: 'cancelled_before_grant' },
    { contractVersion: 'official-reader-s2-no-grant-cancellation-v1', grantCount: 0, scopeCount: 0, disposition: 'wrong_outcome' },
    { contractVersion: 'official-reader-s2-no-grant-cancellation-v1', grantCount: 1, scopeCount: 0, disposition: 'cancelled_before_grant' },
    { contractVersion: 'official-reader-s2-unbound-grant-cancellation-v1', grantCount: 1, scopeCount: 0, effects: [], disposition: 'cancelled_before_binding' },
    { contractVersion: 'official-reader-s2-unbound-grant-cancellation-v1', grantCount: 1, scopeCount: 1, effects: [{}], disposition: 'cancelled_before_binding' },
    { contractVersion: 'official-reader-s2-unbound-grant-cancellation-v1', grantCount: 1, scopeCount: 0, effects: [{}], disposition: 'wrong_outcome' },
    { contractVersion: 'official-reader-s2-revoke-dispatch-v1', grantCount: 1, scopeCount: 0, effects: [{}], providerEventId: EVENT },
    { contractVersion: 'official-reader-s2-revoke-dispatch-v1', grantCount: 1, scopeCount: 1, effects: [{}], providerEventId: RECEIPT },
    { contractVersion: 'official-reader-s2-revoke-dispatch-v1', grantCount: 2, scopeCount: 1, effects: [{}], providerEventId: EVENT },
    { contractVersion: 'official-reader-s2-revoke-dispatch-v1', grantCount: 1, scopeCount: 2, effects: [{}], providerEventId: EVENT },
  ])('ROLLS BACK inconsistent/no-authority cancellation effect %#', async (effect) => {
    const db = mockCommercePool(result(effect));
    await expect(applyVerifiedPortOneV2ReaderFullCancellationV1({
      pool: db.pool, evidence,
    })).rejects.toThrow('Verified Reader cancellation result was not authoritative.');
    expect(db.statements().at(-1)).toBe('ROLLBACK');
    expect(db.release).toHaveBeenCalledWith(undefined);
  });


  it.each([
    {
      label:'bound Reader Grant already revoked before this verified cancellation',
      contractVersion:'official-reader-s2-revoke-dispatch-v1',
      bound:true,
      effect:{
        contractVersion:'official-reader-s2-provider-revoke-v1',
        scopeCount:1,grantId:GRANT,entitlementEventId:null,
        projectionChanged:false,outboxEventId:null,replayed:false,
      },
    },
    {
      label:'unbound Reader Grant already revoked before this verified cancellation',
      contractVersion:'official-reader-s2-unbound-grant-cancellation-v1',
      bound:false,
      effect:{
        result_grant_id:GRANT,result_entitlement_event_id:null,
        result_projection_changed:false,result_outbox_event_id:null,
        result_replayed:false,
      },
    },
    {
      label:'replay of the exact previously applied bound cancellation',
      contractVersion:'official-reader-s2-revoke-dispatch-v1',
      bound:true,
      effect:{
        contractVersion:'official-reader-s2-provider-revoke-v1',
        scopeCount:1,grantId:GRANT,entitlementEventId:ENTITLEMENT_EVENT,
        projectionChanged:false,outboxEventId:null,replayed:true,
      },
    },
    {
      label:'replay of the exact previously applied unbound cancellation',
      contractVersion:'official-reader-s2-unbound-grant-cancellation-v1',
      bound:false,
      effect:{
        result_grant_id:GRANT,result_entitlement_event_id:ENTITLEMENT_EVENT,
        result_projection_changed:false,result_outbox_event_id:null,
        result_replayed:true,
      },
    },
  ])('commits $label without fabricating another Entitlement Event',
    async ({contractVersion,bound,effect}) => {
      const db=mockCommercePool(result({
        contractVersion,grantCount:1,scopeCount:bound?1:0,
        effects:[effect],
        ...(bound?{providerEventId:EVENT}:{disposition:'cancelled_before_binding'}),
      }));
      await expect(applyVerifiedPortOneV2ReaderFullCancellationV1({pool:db.pool,evidence}))
        .resolves.toEqual({
          kind:'revoked',receiptId:RECEIPT,providerEventId:EVENT,grantCount:1,
        });
      expect(db.statements().at(-1)).toBe('COMMIT');
    });

  it.each([
    {
      label:'bound missing Event but missing explicit no-op result',
      contractVersion:'official-reader-s2-revoke-dispatch-v1',
      bound:true,
      effect:{contractVersion:'official-reader-s2-provider-revoke-v1',
        scopeCount:1,grantId:GRANT,entitlementEventId:null,replayed:false},
    },
    {
      label:'bound replay with no original Event',
      contractVersion:'official-reader-s2-revoke-dispatch-v1',
      bound:true,
      effect:{contractVersion:'official-reader-s2-provider-revoke-v1',
        scopeCount:1,grantId:GRANT,entitlementEventId:null,
        projectionChanged:false,outboxEventId:null,replayed:true},
    },
    {
      label:'unbound no-op with a fabricated Outbox event',
      contractVersion:'official-reader-s2-unbound-grant-cancellation-v1',
      bound:false,
      effect:{result_grant_id:GRANT,result_entitlement_event_id:null,
        result_projection_changed:false,result_outbox_event_id:EVENT,
        result_replayed:false},
    },
    {
      label:'unbound no-op claiming a changed projection',
      contractVersion:'official-reader-s2-unbound-grant-cancellation-v1',
      bound:false,
      effect:{result_grant_id:GRANT,result_entitlement_event_id:null,
        result_projection_changed:true,result_outbox_event_id:null,
        result_replayed:false},
    },
  ])('rolls back $label before the original Receipt cancellation commits',
    async ({contractVersion,bound,effect}) => {
      const db=mockCommercePool(result({
        contractVersion,grantCount:1,scopeCount:bound?1:0,effects:[effect],
        ...(bound?{providerEventId:EVENT}:{disposition:'cancelled_before_binding'}),
      }));
      await expect(applyVerifiedPortOneV2ReaderFullCancellationV1({pool:db.pool,evidence}))
        .rejects.toThrow('Verified Reader cancellation result was not authoritative.');
      expect(db.statements().at(-1)).toBe('ROLLBACK');
    });

  it.each([
    {
      label:'scoped dispatch missing its original Entitlement Event',
      contractVersion:'official-reader-s2-revoke-dispatch-v1',
      effect:{contractVersion:'official-reader-s2-provider-revoke-v1',
        scopeCount:1,grantId:GRANT,replayed:false},
    },
    {
      label:'scoped dispatch reporting no held Reader scope',
      contractVersion:'official-reader-s2-revoke-dispatch-v1',
      effect:{contractVersion:'official-reader-s2-provider-revoke-v1',
        scopeCount:0,grantId:GRANT,entitlementEventId:ENTITLEMENT_EVENT,replayed:false},
    },
    {
      label:'unbound cancellation missing its original Grant',
      contractVersion:'official-reader-s2-unbound-grant-cancellation-v1',
      effect:{result_entitlement_event_id:ENTITLEMENT_EVENT,result_replayed:false},
    },
    {
      label:'unbound cancellation claiming a malformed replay flag',
      contractVersion:'official-reader-s2-unbound-grant-cancellation-v1',
      effect:{result_grant_id:GRANT,result_entitlement_event_id:ENTITLEMENT_EVENT,
        result_replayed:'false'},
    },
  ])('ROLLS BACK $label despite a positive Grant count', async ({contractVersion,effect}) => {
    const bound=contractVersion==='official-reader-s2-revoke-dispatch-v1';
    const db=mockCommercePool(result({
      contractVersion,grantCount:1,scopeCount:bound?1:0,
      effects:[effect],
      ...(bound?{providerEventId:EVENT}:{disposition:'cancelled_before_binding'}),
    }));
    await expect(applyVerifiedPortOneV2ReaderFullCancellationV1({pool:db.pool,evidence}))
      .rejects.toThrow('Verified Reader cancellation result was not authoritative.');
    expect(db.statements().at(-1)).toBe('ROLLBACK');
  });

  it.each([
    { contractVersion:'official-reader-s2-revoke-dispatch-v1', bound:true },
    { contractVersion:'official-reader-s2-unbound-grant-cancellation-v1', bound:false },
  ])('rejects two effects attributed to the same original Grant or Event: $contractVersion',
    async ({contractVersion,bound}) => {
      const nested=bound
        ? (grantId:string,eventId:string) => ({
            contractVersion:'official-reader-s2-provider-revoke-v1',
            scopeCount:1,grantId,entitlementEventId:eventId,replayed:false,
          })
        : (grantId:string,eventId:string) => ({
            result_grant_id:grantId,result_entitlement_event_id:eventId,result_replayed:false,
          });
      for (const effects of [
        [nested(GRANT,ENTITLEMENT_EVENT),nested(GRANT,OTHER_ENTITLEMENT_EVENT)],
        [nested(GRANT,ENTITLEMENT_EVENT),nested(OTHER_GRANT,ENTITLEMENT_EVENT)],
      ]) {
        const db=mockCommercePool(result({
          contractVersion,grantCount:2,scopeCount:bound?1:0,effects,
          ...(bound?{providerEventId:EVENT}:{disposition:'cancelled_before_binding'}),
        }));
        await expect(applyVerifiedPortOneV2ReaderFullCancellationV1({pool:db.pool,evidence}))
          .rejects.toThrow('Verified Reader cancellation result was not authoritative.');
        expect(db.statements().at(-1)).toBe('ROLLBACK');
      }
    });

  it('does not change unrelated Commerce handling or allow sandbox cancellation', async () => {
    const db = mockCommercePool({
      contractVersion: 'portone-reader-full-cancellation-v1',
      disposition: 'unrelated_commerce',
    });
    await expect(applyVerifiedPortOneV2ReaderFullCancellationV1({
      pool: db.pool, evidence,
    })).resolves.toEqual({ kind: 'unrelated_commerce' });
    expect(db.statements().at(-1)).toBe('COMMIT');
    const sandbox = Object.freeze({ ...evidence, environment: 'sandbox' as const });
    await expect(applyVerifiedPortOneV2ReaderFullCancellationV1({
      pool: db.pool, evidence: sandbox,
    })).rejects.toThrow('Reader cancellation requires an original production receipt.');
    expect(db.query).toHaveBeenCalledTimes(4);
  });
});
