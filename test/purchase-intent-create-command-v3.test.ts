import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/api-error.js';
import {
  PURCHASE_INTENT_CREATE_AUTHORITY_BINDING_V3,
  PurchaseIntentCreateAuthorityPortErrorV3,
  createPurchaseIntentV3,
  type PurchaseIntentCapabilitySnapshotPortV3,
  type PurchaseIntentCapabilitySnapshotV3,
  type PurchaseIntentCreateAuthorityPortV3,
  type PurchaseIntentCreateAuthorityRowV3,
} from '../apps/api/src/purchase-intent-create-command-v3.js';
import type {
  PurchaseIntentIdPortV1,
  PurchaseIntentOfferSnapshotPortV1,
  PurchaseIntentOfferSnapshotV1,
} from '../apps/api/src/purchase-intent-create-command.js';

const SUBJECT_ID = 'c1070000-0000-0000-0000-000000000001';
const OFFER_ID = 'c1070000-0000-0000-0000-000000000002';
const PRODUCT_ID = 'c1070000-0000-0000-0000-000000000003';
const INTENT_ID = 'c1070000-0000-0000-0000-000000000004';
const REPLAY_INTENT_ID = 'c1070000-0000-0000-0000-000000000005';
const CAPABILITY_SET_ID = 'c1070000-0000-0000-0000-000000000006';

const OFFER_SNAPSHOT: PurchaseIntentOfferSnapshotV1 = Object.freeze({
  productOfferId: OFFER_ID,
  productId: PRODUCT_ID,
  platform: 'web',
  provider: 'testpay',
  externalProductId: 'premium-web-v3',
});

const CAPABILITY_SNAPSHOT: PurchaseIntentCapabilitySnapshotV3 = Object.freeze({
  capabilitySetId: CAPABILITY_SET_ID,
  definitionVersion: 'capability-v3',
  definitionHash: 'sha256:semantic-capability-v3',
});

type AuthorityCall = Parameters<PurchaseIntentCreateAuthorityPortV3['createPurchaseIntent']>[0];

class FakeOfferPort implements PurchaseIntentOfferSnapshotPortV1 {
  readonly calls: Array<{ productOfferId: string }> = [];
  result: PurchaseIntentOfferSnapshotV1 | null = OFFER_SNAPSHOT;

  resolveImmutableOfferMapping(input: {
    readonly productOfferId: string;
  }): PurchaseIntentOfferSnapshotV1 | null {
    this.calls.push(input);
    return this.result;
  }
}

class FakeCapabilityPort implements PurchaseIntentCapabilitySnapshotPortV3 {
  readonly calls: Array<{ productOfferId: string }> = [];
  result: PurchaseIntentCapabilitySnapshotV3 | null = CAPABILITY_SNAPSHOT;

  resolveImmutableCapabilityMapping(input: {
    readonly productOfferId: string;
  }): PurchaseIntentCapabilitySnapshotV3 | null {
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

class FakeAuthorityPort implements PurchaseIntentCreateAuthorityPortV3 {
  readonly calls: AuthorityCall[] = [];
  result: readonly PurchaseIntentCreateAuthorityRowV3[] | Error | undefined;

  createPurchaseIntent(input: AuthorityCall): readonly PurchaseIntentCreateAuthorityRowV3[] {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    if (this.result !== undefined) return this.result;
    return [{
      purchaseIntentId: input.purchaseIntentId,
      productOfferId: input.productOfferId,
      providerAccountLinkId: null,
      status: 'created',
      offerSnapshotJsonb: input.offerSnapshotJsonb,
      offerSnapshotHash: input.offerSnapshotHash,
      expectedAmountMinor: 12900,
      expectedCurrency: 'KRW',
      chargeTermsVersion: 'charge-v3',
      capabilitySetId: input.capabilitySnapshotJsonb.capabilitySetId,
      capabilitySnapshotJsonb: input.capabilitySnapshotJsonb,
      capabilitySnapshotHash: input.capabilitySnapshotHash,
      replayed: false,
    }];
  }
}

function createPorts() {
  return {
    offerSnapshotPort: new FakeOfferPort(),
    capabilitySnapshotPort: new FakeCapabilityPort(),
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

describe('Purchase Intent v3 capability authority boundary', () => {
  it('binds only to the additive capability-aware DB command', () => {
    expect(PURCHASE_INTENT_CREATE_AUTHORITY_BINDING_V3).toBe(
      'public.cmd_create_purchase_intent_v3',
    );
  });

  it('pins trusted immutable Offer and Capability snapshots while keeping capability semantics out of the public request', async () => {
    const ports = createPorts();
    const response = await createPurchaseIntentV3({
      resolvedSubjectId: SUBJECT_ID,
      request: { productOfferId: OFFER_ID, idempotencyKey: 'capability-v3-1' },
      ...ports,
    });

    expect(ports.offerSnapshotPort.calls).toEqual([{ productOfferId: OFFER_ID }]);
    expect(ports.capabilitySnapshotPort.calls).toEqual([{ productOfferId: OFFER_ID }]);
    expect(ports.idPort.calls).toBe(1);
    expect(ports.authorityPort.calls).toHaveLength(1);

    const call = ports.authorityPort.calls[0];
    expect(call).toMatchObject({
      subjectId: SUBJECT_ID,
      purchaseIntentId: INTENT_ID,
      productOfferId: OFFER_ID,
      providerAccountLinkId: null,
      idempotencyKey: 'capability-v3-1',
      offerSnapshotJsonb: OFFER_SNAPSHOT,
      capabilitySnapshotJsonb: CAPABILITY_SNAPSHOT,
    });
    expect(call?.requestHash).toMatch(/^sha256:v1:[0-9a-f]{64}$/);
    expect(call?.offerSnapshotHash).toMatch(/^sha256:v1:[0-9a-f]{64}$/);
    expect(call?.capabilitySnapshotHash).toMatch(/^sha256:v1:[0-9a-f]{64}$/);
    expect(call).not.toHaveProperty('entitlementKey');
    expect(call).not.toHaveProperty('scopeMode');
    expect(call).not.toHaveProperty('itemKey');
    expect(call).not.toHaveProperty('expectedAmountMinor');

    expect(response).toEqual({ purchaseIntentId: INTENT_ID, status: 'created' });
    expect(response).not.toHaveProperty('capabilitySetId');
    expect(response).not.toHaveProperty('entitlementKey');
    expect(Object.isFrozen(response)).toBe(true);
  });

  it('rejects client attempts to inject capability, entitlement, monetary, owner, or status authority', async () => {
    for (const extra of [
      { capabilitySetId: CAPABILITY_SET_ID },
      { definitionVersion: 'client-v' },
      { definitionHash: 'client-hash' },
      { capabilitySnapshotHash: 'client-snapshot-hash' },
      { entitlementKey: 'reading.full' },
      { scopeMode: 'global' },
      { itemKey: 'reading-access' },
      { subjectId: SUBJECT_ID },
      { expectedAmountMinor: 1 },
      { currency: 'KRW' },
      { provider: 'testpay' },
      { status: 'verified' },
    ]) {
      const ports = createPorts();
      await expectApiCode(
        createPurchaseIntentV3({
          resolvedSubjectId: SUBJECT_ID,
          request: { productOfferId: OFFER_ID, idempotencyKey: 'strict-v3', ...extra },
          ...ports,
        }),
        'INVALID_REQUEST',
      );
      expect(ports.offerSnapshotPort.calls).toHaveLength(0);
      expect(ports.capabilitySnapshotPort.calls).toHaveLength(0);
      expect(ports.idPort.calls).toBe(0);
      expect(ports.authorityPort.calls).toHaveLength(0);
    }
  });

  it('requires a resolved subject before any trusted resolver is called', async () => {
    const ports = createPorts();
    await expectApiCode(
      createPurchaseIntentV3({
        request: { productOfferId: OFFER_ID, idempotencyKey: 'auth-v3' },
        ...ports,
      }),
      'AUTH_REQUIRED',
    );
    expect(ports.offerSnapshotPort.calls).toHaveLength(0);
    expect(ports.capabilitySnapshotPort.calls).toHaveLength(0);
    expect(ports.idPort.calls).toBe(0);
    expect(ports.authorityPort.calls).toHaveLength(0);
  });

  it('fails closed before identity allocation when the Offer has no immutable Capability mapping', async () => {
    const ports = createPorts();
    ports.capabilitySnapshotPort.result = null;

    await expectApiCode(
      createPurchaseIntentV3({
        resolvedSubjectId: SUBJECT_ID,
        request: { productOfferId: OFFER_ID, idempotencyKey: 'missing-cap-v3' },
        ...ports,
      }),
      'NOT_FOUND',
    );

    expect(ports.offerSnapshotPort.calls).toHaveLength(1);
    expect(ports.capabilitySnapshotPort.calls).toHaveLength(1);
    expect(ports.idPort.calls).toBe(0);
    expect(ports.authorityPort.calls).toHaveLength(0);
  });

  it('fails closed on malformed trusted Capability snapshot shape', async () => {
    const ports = createPorts();
    ports.capabilitySnapshotPort.result = {
      capabilitySetId: CAPABILITY_SET_ID,
      definitionVersion: '',
      definitionHash: 'sha256:semantic-capability-v3',
    };

    await expect(
      createPurchaseIntentV3({
        resolvedSubjectId: SUBJECT_ID,
        request: { productOfferId: OFFER_ID, idempotencyKey: 'bad-cap-shape-v3' },
        ...ports,
      }),
    ).rejects.toThrow(/Purchase Intent v3 definitionVersion is invalid/);
    expect(ports.idPort.calls).toBe(0);
    expect(ports.authorityPort.calls).toHaveLength(0);
  });

  it('rejects any DB Capability Set, snapshot, or hash drift from the trusted canonical snapshot', async () => {
    const mutations: Array<Partial<PurchaseIntentCreateAuthorityRowV3>> = [
      { capabilitySetId: 'c1070000-0000-0000-0000-000000000099' },
      { capabilitySnapshotJsonb: { ...CAPABILITY_SNAPSHOT, definitionVersion: 'rewritten' } },
      { capabilitySnapshotHash: 'sha256:v1:wrong' },
    ];

    for (const mutation of mutations) {
      const ports = createPorts();
      ports.authorityPort.createPurchaseIntent = function (
        input: AuthorityCall,
      ): readonly PurchaseIntentCreateAuthorityRowV3[] {
        this.calls.push(input);
        return [{
          purchaseIntentId: input.purchaseIntentId,
          productOfferId: input.productOfferId,
          providerAccountLinkId: null,
          status: 'created',
          offerSnapshotJsonb: input.offerSnapshotJsonb,
          offerSnapshotHash: input.offerSnapshotHash,
          expectedAmountMinor: 12900,
          expectedCurrency: 'KRW',
          chargeTermsVersion: 'charge-v3',
          capabilitySetId: input.capabilitySnapshotJsonb.capabilitySetId,
          capabilitySnapshotJsonb: input.capabilitySnapshotJsonb,
          capabilitySnapshotHash: input.capabilitySnapshotHash,
          replayed: false,
          ...mutation,
        }];
      };

      await expect(
        createPurchaseIntentV3({
          resolvedSubjectId: SUBJECT_ID,
          request: { productOfferId: OFFER_ID, idempotencyKey: 'cap-drift-v3' },
          ...ports,
        }),
      ).rejects.toThrow(/Purchase Intent v3 authority returned a different/);
    }
  });

  it('preserves a replayed logical intent with the exact historical Capability provenance', async () => {
    const ports = createPorts();
    ports.authorityPort.createPurchaseIntent = function (
      input: AuthorityCall,
    ): readonly PurchaseIntentCreateAuthorityRowV3[] {
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
        chargeTermsVersion: 'charge-v3',
        capabilitySetId: input.capabilitySnapshotJsonb.capabilitySetId,
        capabilitySnapshotJsonb: input.capabilitySnapshotJsonb,
        capabilitySnapshotHash: input.capabilitySnapshotHash,
        replayed: true,
      }];
    };

    await expect(
      createPurchaseIntentV3({
        resolvedSubjectId: SUBJECT_ID,
        request: { productOfferId: OFFER_ID, idempotencyKey: 'replay-capability-v3' },
        ...ports,
      }),
    ).resolves.toEqual({ purchaseIntentId: REPLAY_INTENT_ID, status: 'verified' });
  });

  it('maps public availability/idempotency failures and keeps provenance corruption internal', async () => {
    for (const [authorityCode, apiCode] of [
      ['SUBJECT_INELIGIBLE', 'FORBIDDEN'],
      ['OFFER_NOT_FOUND', 'NOT_FOUND'],
      ['OFFER_UNAVAILABLE', 'NOT_FOUND'],
      ['CHARGE_TERMS_UNAVAILABLE', 'NOT_FOUND'],
      ['CAPABILITY_UNAVAILABLE', 'NOT_FOUND'],
      ['IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT'],
      ['INVALID_INPUT', 'INVALID_REQUEST'],
    ] as const) {
      const ports = createPorts();
      ports.authorityPort.result = new PurchaseIntentCreateAuthorityPortErrorV3(
        authorityCode,
        'raw authority detail',
      );
      const error = await expectApiCode(
        createPurchaseIntentV3({
          resolvedSubjectId: SUBJECT_ID,
          request: { productOfferId: OFFER_ID, idempotencyKey: 'mapped-v3' },
          ...ports,
        }),
        apiCode,
      );
      expect(error.message).not.toContain('raw authority');
    }

    for (const authorityCode of [
      'REPLAY_SHAPE_CONFLICT',
      'OFFER_SNAPSHOT_MISMATCH',
      'CAPABILITY_SNAPSHOT_MISMATCH',
      'CAPABILITY_AUTHORITY_MISMATCH',
      'REPLAY_CHARGE_TERMS_MISSING',
      'REPLAY_CAPABILITY_MISSING',
      'REPLAY_CAPABILITY_CONFLICT',
      'SERVER_ID_CONFLICT',
    ] as const) {
      const ports = createPorts();
      ports.authorityPort.result = new PurchaseIntentCreateAuthorityPortErrorV3(
        authorityCode,
        'trusted provenance detail',
      );
      await expect(
        createPurchaseIntentV3({
          resolvedSubjectId: SUBJECT_ID,
          request: { productOfferId: OFFER_ID, idempotencyKey: 'trusted-v3' },
          ...ports,
        }),
      ).rejects.toThrow('trusted server-owned command data');
    }
  });

  it('does not route capability pinning through provider, Receipt, or Entitlement authority', () => {
    const source = createPurchaseIntentV3.toString();
    expect(source).not.toContain('receipt');
    expect(source).not.toContain('entitlement');
    expect(source).not.toContain('providerClient');
    expect(source).not.toContain('paymentSuccess');
  });
});
