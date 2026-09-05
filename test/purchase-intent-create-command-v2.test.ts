import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/api-error.js';
import {
  PURCHASE_INTENT_CREATE_AUTHORITY_BINDING_V2,
  PurchaseIntentCreateAuthorityPortErrorV2,
  createPurchaseIntentV2,
  type PurchaseIntentCreateAuthorityPortV2,
  type PurchaseIntentCreateAuthorityRowV2,
} from '../apps/api/src/purchase-intent-create-command-v2.js';
import type {
  PurchaseIntentIdPortV1,
  PurchaseIntentOfferSnapshotPortV1,
  PurchaseIntentOfferSnapshotV1,
} from '../apps/api/src/purchase-intent-create-command.js';

const SUBJECT_ID = 'c9600000-0000-0000-0000-000000000001';
const OFFER_ID = 'c9600000-0000-0000-0000-000000000002';
const PRODUCT_ID = 'c9600000-0000-0000-0000-000000000003';
const INTENT_ID = 'c9600000-0000-0000-0000-000000000004';
const REPLAY_INTENT_ID = 'c9600000-0000-0000-0000-000000000005';

const SNAPSHOT: PurchaseIntentOfferSnapshotV1 = Object.freeze({
  productOfferId: OFFER_ID,
  productId: PRODUCT_ID,
  platform: 'web',
  provider: 'testpay',
  externalProductId: 'premium-web',
});

type AuthorityCall = Parameters<PurchaseIntentCreateAuthorityPortV2['createPurchaseIntent']>[0];

class FakeOfferPort implements PurchaseIntentOfferSnapshotPortV1 {
  readonly calls: Array<{ productOfferId: string }> = [];
  result: PurchaseIntentOfferSnapshotV1 | null = SNAPSHOT;

  resolveImmutableOfferMapping(input: {
    readonly productOfferId: string;
  }): PurchaseIntentOfferSnapshotV1 | null {
    this.calls.push(input);
    return this.result;
  }
}

class FakeIdPort implements PurchaseIntentIdPortV1 {
  calls = 0;
  result = INTENT_ID;

  nextPurchaseIntentId(): string {
    this.calls += 1;
    return this.result;
  }
}

class FakeAuthorityPort implements PurchaseIntentCreateAuthorityPortV2 {
  readonly calls: AuthorityCall[] = [];
  result: readonly PurchaseIntentCreateAuthorityRowV2[] | Error | undefined;

  createPurchaseIntent(input: AuthorityCall): readonly PurchaseIntentCreateAuthorityRowV2[] {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    if (this.result !== undefined) return this.result;
    return [
      {
        purchaseIntentId: input.purchaseIntentId,
        productOfferId: input.productOfferId,
        providerAccountLinkId: null,
        status: 'created',
        offerSnapshotJsonb: input.offerSnapshotJsonb,
        offerSnapshotHash: input.offerSnapshotHash,
        expectedAmountMinor: 12900,
        expectedCurrency: 'KRW',
        chargeTermsVersion: 'charge-v1',
        replayed: false,
      },
    ];
  }
}

function createPorts() {
  return {
    offerSnapshotPort: new FakeOfferPort(),
    idPort: new FakeIdPort(),
    authorityPort: new FakeAuthorityPort(),
  };
}

async function expectApiCode(promise: Promise<unknown>, code: string): Promise<ApiCommandError> {
  try {
    await promise;
    throw new Error('Expected ApiCommandError.');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiCommandError);
    expect((error as ApiCommandError).code).toBe(code);
    return error as ApiCommandError;
  }
}

describe('Purchase Intent v2 API authority boundary', () => {
  it('binds only to the additive Guest/Member DB command', () => {
    expect(PURCHASE_INTENT_CREATE_AUTHORITY_BINDING_V2).toBe(
      'public.cmd_create_purchase_intent_v2',
    );
  });

  it('accepts only offer selection and idempotency while monetary authority stays DB-owned', async () => {
    const ports = createPorts();
    const response = await createPurchaseIntentV2({
      resolvedSubjectId: SUBJECT_ID,
      request: { productOfferId: OFFER_ID, idempotencyKey: 'guest-v2-1' },
      ...ports,
    });

    expect(ports.offerSnapshotPort.calls).toEqual([{ productOfferId: OFFER_ID }]);
    expect(ports.idPort.calls).toBe(1);
    expect(ports.authorityPort.calls).toHaveLength(1);
    const call = ports.authorityPort.calls[0];
    expect(call).toMatchObject({
      subjectId: SUBJECT_ID,
      purchaseIntentId: INTENT_ID,
      productOfferId: OFFER_ID,
      providerAccountLinkId: null,
      idempotencyKey: 'guest-v2-1',
      offerSnapshotJsonb: SNAPSHOT,
    });
    expect(call?.requestHash).toMatch(/^sha256:v1:[0-9a-f]{64}$/);
    expect(call?.offerSnapshotHash).toMatch(/^sha256:v1:[0-9a-f]{64}$/);
    expect(call).not.toHaveProperty('expectedAmountMinor');
    expect(call).not.toHaveProperty('expectedCurrency');
    expect(call).not.toHaveProperty('chargeTermsVersion');

    expect(response).toEqual({ purchaseIntentId: INTENT_ID, status: 'created' });
    expect(response).not.toHaveProperty('expectedAmountMinor');
    expect(response).not.toHaveProperty('expectedCurrency');
    expect(response).not.toHaveProperty('chargeTermsVersion');
    expect(Object.isFrozen(response)).toBe(true);
  });

  it('rejects client attempts to supply owner, amount, currency, provider, or status', async () => {
    for (const extra of [
      { subjectId: SUBJECT_ID },
      { expectedAmountMinor: 1 },
      { amountMinor: 1 },
      { expectedCurrency: 'KRW' },
      { currency: 'KRW' },
      { chargeTermsVersion: 'client-v1' },
      { provider: 'testpay' },
      { providerAccountLinkId: 'client-link' },
      { purchaseIntentId: INTENT_ID },
      { status: 'verified' },
    ]) {
      const ports = createPorts();
      await expectApiCode(
        createPurchaseIntentV2({
          resolvedSubjectId: SUBJECT_ID,
          request: { productOfferId: OFFER_ID, idempotencyKey: 'strict-v2', ...extra },
          ...ports,
        }),
        'INVALID_REQUEST',
      );
      expect(ports.offerSnapshotPort.calls).toHaveLength(0);
      expect(ports.idPort.calls).toBe(0);
      expect(ports.authorityPort.calls).toHaveLength(0);
    }
  });

  it('requires a server-resolved subject before any trusted port is called', async () => {
    const ports = createPorts();
    await expectApiCode(
      createPurchaseIntentV2({
        request: { productOfferId: OFFER_ID, idempotencyKey: 'auth-v2' },
        ...ports,
      }),
      'AUTH_REQUIRED',
    );
    expect(ports.offerSnapshotPort.calls).toHaveLength(0);
    expect(ports.idPort.calls).toBe(0);
    expect(ports.authorityPort.calls).toHaveLength(0);
  });

  it('fails closed when the DB monetary tuple is not exactly representable and canonical', async () => {
    const invalidRows: Array<Partial<PurchaseIntentCreateAuthorityRowV2>> = [
      { expectedAmountMinor: 0 },
      { expectedAmountMinor: -1 },
      { expectedAmountMinor: 1.5 },
      { expectedAmountMinor: Number.MAX_SAFE_INTEGER + 1 },
      { expectedAmountMinor: '12900' },
      { expectedCurrency: 'krw' },
      { expectedCurrency: 'KRWW' },
      { expectedCurrency: '' },
      { chargeTermsVersion: '' },
      { chargeTermsVersion: '   ' },
      { chargeTermsVersion: null },
    ];

    for (const mutation of invalidRows) {
      const ports = createPorts();
      ports.authorityPort.result = [
        {
          purchaseIntentId: INTENT_ID,
          productOfferId: OFFER_ID,
          providerAccountLinkId: null,
          status: 'created',
          offerSnapshotJsonb: SNAPSHOT,
          offerSnapshotHash: '',
          expectedAmountMinor: 12900,
          expectedCurrency: 'KRW',
          chargeTermsVersion: 'charge-v1',
          replayed: false,
          ...mutation,
        },
      ];
      ports.authorityPort.createPurchaseIntent = function (
        input: AuthorityCall,
      ): readonly PurchaseIntentCreateAuthorityRowV2[] {
        this.calls.push(input);
        const row = this.result as readonly PurchaseIntentCreateAuthorityRowV2[];
        return [{ ...row[0]!, offerSnapshotHash: input.offerSnapshotHash }];
      };

      await expect(
        createPurchaseIntentV2({
          resolvedSubjectId: SUBJECT_ID,
          request: { productOfferId: OFFER_ID, idempotencyKey: 'bad-money-v2' },
          ...ports,
        }),
      ).rejects.toThrow(/Purchase Intent v2 authority returned an invalid/);
    }
  });

  it('accepts the exact maximum JavaScript safe-integer amount', async () => {
    const ports = createPorts();
    ports.authorityPort.createPurchaseIntent = function (
      input: AuthorityCall,
    ): readonly PurchaseIntentCreateAuthorityRowV2[] {
      this.calls.push(input);
      return [{
        purchaseIntentId: input.purchaseIntentId,
        productOfferId: input.productOfferId,
        providerAccountLinkId: null,
        status: 'created',
        offerSnapshotJsonb: input.offerSnapshotJsonb,
        offerSnapshotHash: input.offerSnapshotHash,
        expectedAmountMinor: Number.MAX_SAFE_INTEGER,
        expectedCurrency: 'KRW',
        chargeTermsVersion: 'max-safe-v1',
        replayed: false,
      }];
    };

    await expect(
      createPurchaseIntentV2({
        resolvedSubjectId: SUBJECT_ID,
        request: { productOfferId: OFFER_ID, idempotencyKey: 'max-safe-v2' },
        ...ports,
      }),
    ).resolves.toEqual({ purchaseIntentId: INTENT_ID, status: 'created' });
  });

  it('preserves a replayed logical intent while still validating its pinned monetary tuple', async () => {
    const ports = createPorts();
    ports.authorityPort.createPurchaseIntent = function (
      input: AuthorityCall,
    ): readonly PurchaseIntentCreateAuthorityRowV2[] {
      this.calls.push(input);
      return [{
        purchaseIntentId: REPLAY_INTENT_ID,
        productOfferId: input.productOfferId,
        providerAccountLinkId: null,
        status: 'verified',
        offerSnapshotJsonb: input.offerSnapshotJsonb,
        offerSnapshotHash: input.offerSnapshotHash,
        expectedAmountMinor: 12900,
        expectedCurrency: 'KRW',
        chargeTermsVersion: 'charge-v1',
        replayed: true,
      }];
    };

    await expect(
      createPurchaseIntentV2({
        resolvedSubjectId: SUBJECT_ID,
        request: { productOfferId: OFFER_ID, idempotencyKey: 'replay-v2' },
        ...ports,
      }),
    ).resolves.toEqual({ purchaseIntentId: REPLAY_INTENT_ID, status: 'verified' });
  });

  it('maps eligibility, charge availability, and idempotency failures without leaking raw authority detail', async () => {
    for (const [authorityCode, apiCode] of [
      ['SUBJECT_INELIGIBLE', 'FORBIDDEN'],
      ['OFFER_NOT_FOUND', 'NOT_FOUND'],
      ['OFFER_UNAVAILABLE', 'NOT_FOUND'],
      ['CHARGE_TERMS_UNAVAILABLE', 'NOT_FOUND'],
      ['IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT'],
      ['INVALID_INPUT', 'INVALID_REQUEST'],
    ] as const) {
      const ports = createPorts();
      ports.authorityPort.result = new PurchaseIntentCreateAuthorityPortErrorV2(
        authorityCode,
        'raw database ownership or monetary detail',
      );
      const error = await expectApiCode(
        createPurchaseIntentV2({
          resolvedSubjectId: SUBJECT_ID,
          request: { productOfferId: OFFER_ID, idempotencyKey: 'mapped-v2' },
          ...ports,
        }),
        apiCode,
      );
      expect(error.message).not.toContain('raw database');
    }
  });

  it('treats trusted replay/snapshot/charge provenance failures as internal fail-closed errors', async () => {
    for (const authorityCode of [
      'REPLAY_SHAPE_CONFLICT',
      'OFFER_SNAPSHOT_MISMATCH',
      'REPLAY_CHARGE_TERMS_MISSING',
      'SERVER_ID_CONFLICT',
    ] as const) {
      const ports = createPorts();
      ports.authorityPort.result = new PurchaseIntentCreateAuthorityPortErrorV2(
        authorityCode,
        'trusted-data detail',
      );
      await expect(
        createPurchaseIntentV2({
          resolvedSubjectId: SUBJECT_ID,
          request: { productOfferId: OFFER_ID, idempotencyKey: 'trusted-v2' },
          ...ports,
        }),
      ).rejects.toThrow('trusted server-owned command data');
    }
  });

  it('does not route through provider, Receipt, or Entitlement authority', () => {
    const source = createPurchaseIntentV2.toString();
    expect(source).not.toContain('receipt');
    expect(source).not.toContain('entitlement');
    expect(source).not.toContain('providerClient');
    expect(source).not.toContain('paymentSuccess');
  });
});
