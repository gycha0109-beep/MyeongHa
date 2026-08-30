import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/chat-receive.js';
import {
  PURCHASE_INTENT_CREATE_AUTHORITY_BINDING_V1,
  PurchaseIntentCreateAuthorityPortErrorV1,
  createPurchaseIntent,
  type PurchaseIntentCreateAuthorityPortV1,
  type PurchaseIntentCreateAuthorityRowV1,
  type PurchaseIntentIdPortV1,
  type PurchaseIntentOfferSnapshotPortV1,
  type PurchaseIntentOfferSnapshotV1,
} from '../apps/api/src/purchase-intent-create-command.js';

const SUBJECT_ID = '91000000-0000-0000-0000-00000000b126';
const OFFER_ID = '92000000-0000-0000-0000-00000000b126';
const PRODUCT_ID = '93000000-0000-0000-0000-00000000b126';
const INTENT_ID = '94000000-0000-0000-0000-00000000b126';
const EXISTING_INTENT_ID = '95000000-0000-0000-0000-00000000b126';

const OFFER_SNAPSHOT: PurchaseIntentOfferSnapshotV1 = Object.freeze({
  productOfferId: OFFER_ID,
  productId: PRODUCT_ID,
  platform: 'web',
  provider: 'testpay',
  externalProductId: 'premium-web',
});

type AuthorityCall = Parameters<PurchaseIntentCreateAuthorityPortV1['createPurchaseIntent']>[0];

class FakeOfferSnapshotPortV1 implements PurchaseIntentOfferSnapshotPortV1 {
  readonly calls: Array<{ productOfferId: string }> = [];
  result: PurchaseIntentOfferSnapshotV1 | null | Error = OFFER_SNAPSHOT;

  resolveImmutableOfferMapping(input: {
    readonly productOfferId: string;
  }): PurchaseIntentOfferSnapshotV1 | null {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class FakeIdPortV1 implements PurchaseIntentIdPortV1 {
  calls = 0;
  result: string | Error = INTENT_ID;

  nextPurchaseIntentId(): string {
    this.calls += 1;
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class FakeAuthorityPortV1 implements PurchaseIntentCreateAuthorityPortV1 {
  readonly calls: AuthorityCall[] = [];
  result: readonly PurchaseIntentCreateAuthorityRowV1[] | Error | undefined;

  createPurchaseIntent(input: AuthorityCall): readonly PurchaseIntentCreateAuthorityRowV1[] {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    if (this.result !== undefined) return this.result;
    return [
      {
        purchaseIntentId: input.purchaseIntentId,
        productOfferId: input.productOfferId,
        providerAccountLinkId: input.providerAccountLinkId,
        status: 'created',
        offerSnapshotJsonb: input.offerSnapshotJsonb,
        offerSnapshotHash: input.offerSnapshotHash,
        replayed: false,
      },
    ];
  }
}

async function expectApiCode(
  promise: Promise<unknown>,
  code: string,
): Promise<ApiCommandError> {
  try {
    await promise;
    throw new Error('Expected ApiCommandError.');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiCommandError);
    expect((error as ApiCommandError).code).toBe(code);
    return error as ApiCommandError;
  }
}

function createPorts() {
  return {
    offerSnapshotPort: new FakeOfferSnapshotPortV1(),
    idPort: new FakeIdPortV1(),
    authorityPort: new FakeAuthorityPortV1(),
  };
}

describe('Purchase Intent create API authority boundary', () => {
  it('pins POST /api/commerce/purchase-intents to the existing source-complete DB command', () => {
    expect(PURCHASE_INTENT_CREATE_AUTHORITY_BINDING_V1).toBe(
      'public.cmd_create_purchase_intent_v1',
    );
  });

  it('accepts only offer selection + idempotency and pins server-generated immutable provenance', async () => {
    const ports = createPorts();

    const response = await createPurchaseIntent({
      resolvedSubjectId: SUBJECT_ID,
      request: {
        productOfferId: OFFER_ID,
        idempotencyKey: 'purchase-b126-1',
      },
      ...ports,
    });

    expect(ports.offerSnapshotPort.calls).toEqual([{ productOfferId: OFFER_ID }]);
    expect(ports.idPort.calls).toBe(1);
    expect(ports.authorityPort.calls).toHaveLength(1);

    const call = ports.authorityPort.calls[0];
    expect(call).toBeDefined();
    expect(call).toMatchObject({
      subjectId: SUBJECT_ID,
      purchaseIntentId: INTENT_ID,
      productOfferId: OFFER_ID,
      providerAccountLinkId: null,
      idempotencyKey: 'purchase-b126-1',
      offerSnapshotJsonb: OFFER_SNAPSHOT,
    });
    expect(call?.requestHash).toMatch(/^sha256:v1:[0-9a-f]{64}$/);
    expect(call?.offerSnapshotHash).toMatch(/^sha256:v1:[0-9a-f]{64}$/);
    expect(Object.keys(call?.offerSnapshotJsonb ?? {}).sort()).toEqual([
      'externalProductId',
      'platform',
      'productId',
      'productOfferId',
      'provider',
    ]);

    expect(response).toEqual({ purchaseIntentId: INTENT_ID, status: 'created' });
    expect(response).not.toHaveProperty('productOfferId');
    expect(response).not.toHaveProperty('providerAccountLinkId');
    expect(response).not.toHaveProperty('requestHash');
    expect(response).not.toHaveProperty('offerSnapshotJsonb');
    expect(response).not.toHaveProperty('offerSnapshotHash');
    expect(response).not.toHaveProperty('replayed');
    expect(response).not.toHaveProperty('receipt');
    expect(response).not.toHaveProperty('entitlement');
    expect(Object.isFrozen(response)).toBe(true);
  });

  it('uses offer selection as canonical payload and keeps idempotency key as the logical command key', async () => {
    const first = createPorts();
    await createPurchaseIntent({
      resolvedSubjectId: SUBJECT_ID,
      request: { productOfferId: OFFER_ID, idempotencyKey: 'purchase-key-a' },
      ...first,
    });

    const second = createPorts();
    await createPurchaseIntent({
      resolvedSubjectId: SUBJECT_ID,
      request: { idempotencyKey: 'purchase-key-b', productOfferId: OFFER_ID },
      ...second,
    });

    expect(first.authorityPort.calls[0]?.requestHash).toBe(
      second.authorityPort.calls[0]?.requestHash,
    );
    expect(first.authorityPort.calls[0]?.offerSnapshotHash).toBe(
      second.authorityPort.calls[0]?.offerSnapshotHash,
    );
  });

  it('preserves existing logical replay even when its current status is no longer created', async () => {
    const ports = createPorts();
    ports.authorityPort.result = [
      {
        purchaseIntentId: EXISTING_INTENT_ID,
        productOfferId: OFFER_ID,
        providerAccountLinkId: null,
        status: 'verified',
        offerSnapshotJsonb: OFFER_SNAPSHOT,
        offerSnapshotHash: 'placeholder',
        replayed: true,
      },
    ];
    ports.authorityPort.createPurchaseIntent = function (
      input: AuthorityCall,
    ): readonly PurchaseIntentCreateAuthorityRowV1[] {
      this.calls.push(input);
      return [
        {
          purchaseIntentId: EXISTING_INTENT_ID,
          productOfferId: input.productOfferId,
          providerAccountLinkId: null,
          status: 'verified',
          offerSnapshotJsonb: input.offerSnapshotJsonb,
          offerSnapshotHash: input.offerSnapshotHash,
          replayed: true,
        },
      ];
    };

    const response = await createPurchaseIntent({
      resolvedSubjectId: SUBJECT_ID,
      request: { productOfferId: OFFER_ID, idempotencyKey: 'purchase-replay' },
      ...ports,
    });

    expect(response).toEqual({
      purchaseIntentId: EXISTING_INTENT_ID,
      status: 'verified',
    });
    expect(ports.offerSnapshotPort.calls).toEqual([{ productOfferId: OFFER_ID }]);
    expect(ports.authorityPort.calls[0]?.purchaseIntentId).toBe(INTENT_ID);
  });

  it('rejects missing identity and malformed/unknown public request fields before trusted ports', async () => {
    {
      const ports = createPorts();
      await expectApiCode(
        createPurchaseIntent({
          request: { productOfferId: OFFER_ID, idempotencyKey: 'key' },
          ...ports,
        }),
        'AUTH_REQUIRED',
      );
      expect(ports.offerSnapshotPort.calls).toHaveLength(0);
      expect(ports.idPort.calls).toBe(0);
      expect(ports.authorityPort.calls).toHaveLength(0);
    }

    for (const request of [
      null,
      [],
      'purchase',
      {},
      { productOfferId: OFFER_ID },
      { idempotencyKey: 'key' },
      { productOfferId: '', idempotencyKey: 'key' },
      { productOfferId: '   ', idempotencyKey: 'key' },
      { productOfferId: 123, idempotencyKey: 'key' },
      { productOfferId: OFFER_ID, idempotencyKey: '' },
      { productOfferId: OFFER_ID, idempotencyKey: '   ' },
      { productOfferId: OFFER_ID, idempotencyKey: 123 },
      { productOfferId: OFFER_ID, idempotencyKey: 'key', purchaseIntentId: INTENT_ID },
      { productOfferId: OFFER_ID, idempotencyKey: 'key', providerAccountLinkId: 'client-link' },
      { productOfferId: OFFER_ID, idempotencyKey: 'key', requestHash: 'client-hash' },
      { productOfferId: OFFER_ID, idempotencyKey: 'key', offerSnapshotHash: 'client-hash' },
      { productOfferId: OFFER_ID, idempotencyKey: 'key', platform: 'web' },
      { productOfferId: OFFER_ID, idempotencyKey: 'key', status: 'verified' },
    ]) {
      const ports = createPorts();
      await expectApiCode(
        createPurchaseIntent({
          resolvedSubjectId: SUBJECT_ID,
          request,
          ...ports,
        }),
        'INVALID_REQUEST',
      );
      expect(ports.offerSnapshotPort.calls).toHaveLength(0);
      expect(ports.idPort.calls).toBe(0);
      expect(ports.authorityPort.calls).toHaveLength(0);
    }
  });

  it('returns NOT_FOUND when immutable offer mapping cannot be resolved without invoking DB authority', async () => {
    const ports = createPorts();
    ports.offerSnapshotPort.result = null;

    await expectApiCode(
      createPurchaseIntent({
        resolvedSubjectId: SUBJECT_ID,
        request: { productOfferId: OFFER_ID, idempotencyKey: 'missing-offer' },
        ...ports,
      }),
      'NOT_FOUND',
    );

    expect(ports.idPort.calls).toBe(0);
    expect(ports.authorityPort.calls).toHaveLength(0);
  });

  it('fails closed on malformed trusted immutable offer mapping before generating an id or invoking DB authority', async () => {
    const invalidSnapshots: unknown[] = [
      { ...OFFER_SNAPSHOT, productOfferId: 'different-offer' },
      { ...OFFER_SNAPSHOT, platform: 'windows-store' },
      { ...OFFER_SNAPSHOT, provider: '' },
      { ...OFFER_SNAPSHOT, currency: 'KRW' },
      {
        productOfferId: OFFER_ID,
        productId: PRODUCT_ID,
        platform: 'web',
        provider: 'testpay',
      },
    ];

    for (const snapshot of invalidSnapshots) {
      const ports = createPorts();
      ports.offerSnapshotPort.result = snapshot as PurchaseIntentOfferSnapshotV1;

      await expect(
        createPurchaseIntent({
          resolvedSubjectId: SUBJECT_ID,
          request: { productOfferId: OFFER_ID, idempotencyKey: 'bad-snapshot' },
          ...ports,
        }),
      ).rejects.toThrow(/Purchase Intent/);
      expect(ports.idPort.calls).toBe(0);
      expect(ports.authorityPort.calls).toHaveLength(0);
    }
  });

  it('fails closed on an invalid server-generated logical id before DB authority', async () => {
    for (const generatedId of ['', '   ']) {
      const ports = createPorts();
      ports.idPort.result = generatedId;

      await expect(
        createPurchaseIntent({
          resolvedSubjectId: SUBJECT_ID,
          request: { productOfferId: OFFER_ID, idempotencyKey: 'bad-id' },
          ...ports,
        }),
      ).rejects.toThrow(/generated purchase intent id/);
      expect(ports.authorityPort.calls).toHaveLength(0);
    }
  });

  it('maps member/offer/idempotency failures to bounded public errors without leaking raw authority detail', async () => {
    for (const [authorityCode, apiCode] of [
      ['SUBJECT_NOT_FOUND', 'NOT_FOUND'],
      ['SUBJECT_INELIGIBLE', 'FORBIDDEN'],
      ['OFFER_NOT_FOUND', 'NOT_FOUND'],
      ['OFFER_UNAVAILABLE', 'NOT_FOUND'],
      ['IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT'],
      ['INVALID_INPUT', 'INVALID_REQUEST'],
    ] as const) {
      const ports = createPorts();
      ports.authorityPort.result = new PurchaseIntentCreateAuthorityPortErrorV1(
        authorityCode,
        'raw database ownership or catalog detail',
      );

      const error = await expectApiCode(
        createPurchaseIntent({
          resolvedSubjectId: SUBJECT_ID,
          request: { productOfferId: OFFER_ID, idempotencyKey: 'mapped-error' },
          ...ports,
        }),
        apiCode,
      );
      expect(error.message).not.toContain('raw database');
    }
  });

  it('treats trusted replay/snapshot/server-id contract failures as internal fail-closed errors', async () => {
    for (const authorityCode of [
      'REPLAY_SHAPE_CONFLICT',
      'OFFER_SNAPSHOT_MISMATCH',
      'SERVER_ID_CONFLICT',
    ] as const) {
      const ports = createPorts();
      ports.authorityPort.result = new PurchaseIntentCreateAuthorityPortErrorV1(
        authorityCode,
        'raw trusted-data detail',
      );

      await expect(
        createPurchaseIntent({
          resolvedSubjectId: SUBJECT_ID,
          request: { productOfferId: OFFER_ID, idempotencyKey: 'trusted-error' },
          ...ports,
        }),
      ).rejects.toThrow('trusted server-owned command data');
    }
  });

  it('fails closed if the DB authority returns malformed, mismatched, or multiple rows', async () => {
    const makeBaseRow = (): PurchaseIntentCreateAuthorityRowV1 => ({
      purchaseIntentId: INTENT_ID,
      productOfferId: OFFER_ID,
      providerAccountLinkId: null,
      status: 'created',
      offerSnapshotJsonb: OFFER_SNAPSHOT,
      offerSnapshotHash: '',
      replayed: false,
    });

    const rowMutators: Array<(input: AuthorityCall) => readonly PurchaseIntentCreateAuthorityRowV1[]> = [
      () => [],
      (input) => [
        {
          ...makeBaseRow(),
          offerSnapshotHash: input.offerSnapshotHash,
        },
        {
          ...makeBaseRow(),
          purchaseIntentId: EXISTING_INTENT_ID,
          offerSnapshotHash: input.offerSnapshotHash,
        },
      ],
      (input) => [
        {
          ...makeBaseRow(),
          purchaseIntentId: 'different-new-id',
          offerSnapshotHash: input.offerSnapshotHash,
        },
      ],
      (input) => [
        {
          ...makeBaseRow(),
          productOfferId: 'different-offer',
          offerSnapshotHash: input.offerSnapshotHash,
        },
      ],
      (input) => [
        {
          ...makeBaseRow(),
          providerAccountLinkId: 'unexpected-provider-link',
          offerSnapshotHash: input.offerSnapshotHash,
        },
      ],
      (input) => [
        {
          ...makeBaseRow(),
          offerSnapshotJsonb: { ...OFFER_SNAPSHOT, provider: 'different-provider' },
          offerSnapshotHash: input.offerSnapshotHash,
        },
      ],
      () => [
        {
          ...makeBaseRow(),
          offerSnapshotHash: 'sha256:v1:different',
        },
      ],
      (input) => [
        {
          ...makeBaseRow(),
          status: 'unknown',
          offerSnapshotHash: input.offerSnapshotHash,
        },
      ],
      (input) => [
        {
          ...makeBaseRow(),
          status: 'pending',
          offerSnapshotHash: input.offerSnapshotHash,
        },
      ],
    ];

    for (const rowsForInput of rowMutators) {
      const ports = createPorts();
      ports.authorityPort.createPurchaseIntent = function (
        input: AuthorityCall,
      ): readonly PurchaseIntentCreateAuthorityRowV1[] {
        this.calls.push(input);
        return rowsForInput(input);
      };

      await expect(
        createPurchaseIntent({
          resolvedSubjectId: SUBJECT_ID,
          request: { productOfferId: OFFER_ID, idempotencyKey: 'bad-row' },
          ...ports,
        }),
      ).rejects.toThrow();
    }
  });

  it('rethrows immutable-mapping, id generation, and DB infrastructure failures unchanged', async () => {
    const mappingFailure = new Error('catalog projection unavailable');
    {
      const ports = createPorts();
      ports.offerSnapshotPort.result = mappingFailure;
      await expect(
        createPurchaseIntent({
          resolvedSubjectId: SUBJECT_ID,
          request: { productOfferId: OFFER_ID, idempotencyKey: 'infra-1' },
          ...ports,
        }),
      ).rejects.toBe(mappingFailure);
    }

    const idFailure = new Error('id generator unavailable');
    {
      const ports = createPorts();
      ports.idPort.result = idFailure;
      await expect(
        createPurchaseIntent({
          resolvedSubjectId: SUBJECT_ID,
          request: { productOfferId: OFFER_ID, idempotencyKey: 'infra-2' },
          ...ports,
        }),
      ).rejects.toBe(idFailure);
    }

    const dbFailure = new Error('database transport unavailable');
    {
      const ports = createPorts();
      ports.authorityPort.result = dbFailure;
      await expect(
        createPurchaseIntent({
          resolvedSubjectId: SUBJECT_ID,
          request: { productOfferId: OFFER_ID, idempotencyKey: 'infra-3' },
          ...ports,
        }),
      ).rejects.toBe(dbFailure);
    }
  });
});
