import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/api-error.js';
import {
  STANDARD_READING_PURCHASE_INTENT_CREATE_AUTHORITY_BINDING_V4,
  STANDARD_READING_READER_SELECTION_CONTRACT_V1,
  StandardReadingPurchaseIntentAuthorityPortErrorV4,
  createStandardReadingPurchaseIntentV4,
  type StandardReadingPurchaseIntentAuthorityPortV4,
  type StandardReadingPurchaseIntentAuthorityRowV4,
  type StandardReadingReaderSelectionPortV4,
  type StandardReadingReaderSelectionResolutionV4,
} from '../apps/api/src/standard-reading-purchase-intent-create-command-v4.js';
import type {
  PurchaseIntentCapabilitySnapshotPortV3,
  PurchaseIntentCapabilitySnapshotV3,
} from '../apps/api/src/purchase-intent-create-command-v3.js';
import type {
  PurchaseIntentIdPortV1,
  PurchaseIntentOfferSnapshotPortV1,
  PurchaseIntentOfferSnapshotV1,
} from '../apps/api/src/purchase-intent-create-command.js';

const SUBJECT_ID = 'd1074000-0000-0000-0000-000000000001';
const OFFER_ID = 'd1074000-0000-0000-0000-000000000002';
const PRODUCT_ID = '11300000-0000-0000-0000-000000000001';
const INTENT_ID = 'd1074000-0000-0000-0000-000000000004';
const REPLAY_INTENT_ID = 'd1074000-0000-0000-0000-000000000005';
const CAPABILITY_SET_ID = '11301000-0000-0000-0000-000000000001';
const READER_ID = 'baekheon';
const OTHER_READER_ID = 'rahyeon';
const BUNDLE_ID = 'd1074000-0000-0000-0000-000000000006';

const OFFER_SNAPSHOT: PurchaseIntentOfferSnapshotV1 = Object.freeze({
  productOfferId: OFFER_ID,
  productId: PRODUCT_ID,
  platform: 'web',
  provider: 'portone_v2',
  externalProductId: 'future-standard-love-relationship',
});

const CAPABILITY_SNAPSHOT: PurchaseIntentCapabilitySnapshotV3 = Object.freeze({
  capabilitySetId: CAPABILITY_SET_ID,
  definitionVersion: 'v1',
  definitionHash: 'sha256:2ac901096369a6ea38cd180dff9fcd078efdfccbfca17117d6c282d116f76524',
});

const READER_RESOLUTION: StandardReadingReaderSelectionResolutionV4 = Object.freeze({
  productId: PRODUCT_ID,
  topicKey: 'love_relationship',
  specVersion: 'v1',
  readerCharacterId: READER_ID,
  readerContentBundleId: BUNDLE_ID,
});

type AuthorityCall = Parameters<StandardReadingPurchaseIntentAuthorityPortV4['createPurchaseIntent']>[0];

class FakeOfferPort implements PurchaseIntentOfferSnapshotPortV1 {
  readonly calls: Array<{ productOfferId: string }> = [];
  result: PurchaseIntentOfferSnapshotV1 | null = OFFER_SNAPSHOT;
  resolveImmutableOfferMapping(input: { readonly productOfferId: string }): PurchaseIntentOfferSnapshotV1 | null {
    this.calls.push(input);
    return this.result;
  }
}

class FakeCapabilityPort implements PurchaseIntentCapabilitySnapshotPortV3 {
  readonly calls: Array<{ productOfferId: string }> = [];
  result: PurchaseIntentCapabilitySnapshotV3 | null = CAPABILITY_SNAPSHOT;
  resolveImmutableCapabilityMapping(input: { readonly productOfferId: string }): PurchaseIntentCapabilitySnapshotV3 | null {
    this.calls.push(input);
    return this.result;
  }
}

class FakeReaderPort implements StandardReadingReaderSelectionPortV4 {
  readonly calls: Array<{ subjectId: string; productId: string; readerCharacterId: string }> = [];
  result: StandardReadingReaderSelectionResolutionV4 | null = READER_RESOLUTION;
  resolveEligibleReaderSelection(input: {
    readonly subjectId: string;
    readonly productId: string;
    readonly readerCharacterId: string;
  }): StandardReadingReaderSelectionResolutionV4 | null {
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

class FakeAuthorityPort implements StandardReadingPurchaseIntentAuthorityPortV4 {
  readonly calls: AuthorityCall[] = [];
  result: readonly StandardReadingPurchaseIntentAuthorityRowV4[] | Error | undefined;

  createPurchaseIntent(input: AuthorityCall): readonly StandardReadingPurchaseIntentAuthorityRowV4[] {
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
      expectedAmountMinor: 8900,
      expectedCurrency: 'KRW',
      chargeTermsVersion: 'future-charge-v1',
      capabilitySetId: input.capabilitySnapshotJsonb.capabilitySetId,
      capabilitySnapshotJsonb: input.capabilitySnapshotJsonb,
      capabilitySnapshotHash: input.capabilitySnapshotHash,
      readerCharacterId: input.readerCharacterId,
      readerContentBundleId: input.readerContentBundleId,
      readerSelectionSnapshotJsonb: input.readerSelectionSnapshotJsonb,
      readerSelectionHash: input.readerSelectionHash,
      replayed: false,
    }];
  }
}

function createPorts() {
  return {
    offerSnapshotPort: new FakeOfferPort(),
    capabilitySnapshotPort: new FakeCapabilityPort(),
    readerSelectionPort: new FakeReaderPort(),
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

describe('Standard Reading Purchase Intent v4 Reader authority adapter', () => {
  it('binds only to the existing fail-closed atomic DB command', () => {
    expect(STANDARD_READING_PURCHASE_INTENT_CREATE_AUTHORITY_BINDING_V4).toBe(
      'public.cmd_create_standard_reading_purchase_intent_v4',
    );
  });

  it('accepts only Offer, idempotency, and Reader Character client fields and pins all Reader provenance server-side', async () => {
    const ports = createPorts();
    const response = await createStandardReadingPurchaseIntentV4({
      resolvedSubjectId: SUBJECT_ID,
      request: {
        productOfferId: OFFER_ID,
        idempotencyKey: 'standard-reader-v4-1',
        readerCharacterId: READER_ID,
      },
      ...ports,
    });

    expect(ports.offerSnapshotPort.calls).toEqual([{ productOfferId: OFFER_ID }]);
    expect(ports.capabilitySnapshotPort.calls).toEqual([{ productOfferId: OFFER_ID }]);
    expect(ports.readerSelectionPort.calls).toEqual([{
      subjectId: SUBJECT_ID,
      productId: PRODUCT_ID,
      readerCharacterId: READER_ID,
    }]);
    expect(ports.idPort.calls).toBe(1);
    expect(ports.authorityPort.calls).toHaveLength(1);

    const call = ports.authorityPort.calls[0];
    expect(call).toMatchObject({
      subjectId: SUBJECT_ID,
      purchaseIntentId: INTENT_ID,
      productOfferId: OFFER_ID,
      providerAccountLinkId: null,
      idempotencyKey: 'standard-reader-v4-1',
      productId: PRODUCT_ID,
      readerCharacterId: READER_ID,
      readerContentBundleId: BUNDLE_ID,
      readerSelectionContractVersion: STANDARD_READING_READER_SELECTION_CONTRACT_V1,
      readerSelectionSnapshotJsonb: {
        schemaVersion: STANDARD_READING_READER_SELECTION_CONTRACT_V1,
        productId: PRODUCT_ID,
        topicKey: 'love_relationship',
        specVersion: 'v1',
        readerCharacterId: READER_ID,
        readerContentBundleId: BUNDLE_ID,
      },
    });
    expect(call?.requestHash).toMatch(/^sha256:v1:[0-9a-f]{64}$/);
    expect(call?.readerSelectionHash).toMatch(/^sha256:v1:[0-9a-f]{64}$/);
    expect(response).toEqual({ purchaseIntentId: INTENT_ID, status: 'created' });
  });

  it('rejects client attempts to inject Product, bundle, snapshot, hash, owner, payment, or entitlement authority before any resolver call', async () => {
    for (const extra of [
      { productId: PRODUCT_ID },
      { readerContentBundleId: BUNDLE_ID },
      { readerSelectionContractVersion: STANDARD_READING_READER_SELECTION_CONTRACT_V1 },
      { readerSelectionSnapshotJsonb: {} },
      { readerSelectionHash: 'client-hash' },
      { subjectId: SUBJECT_ID },
      { capabilitySetId: CAPABILITY_SET_ID },
      { expectedAmountMinor: 1 },
      { paymentId: 'forged' },
      { entitlementKey: 'reading.standard.love_relationship.unit.v1' },
    ]) {
      const ports = createPorts();
      await expectApiCode(
        createStandardReadingPurchaseIntentV4({
          resolvedSubjectId: SUBJECT_ID,
          request: {
            productOfferId: OFFER_ID,
            idempotencyKey: 'strict-v4',
            readerCharacterId: READER_ID,
            ...extra,
          },
          ...ports,
        }),
        'INVALID_REQUEST',
      );
      expect(ports.offerSnapshotPort.calls).toHaveLength(0);
      expect(ports.capabilitySnapshotPort.calls).toHaveLength(0);
      expect(ports.readerSelectionPort.calls).toHaveLength(0);
      expect(ports.idPort.calls).toBe(0);
      expect(ports.authorityPort.calls).toHaveLength(0);
    }
  });

  it('requires a resolved subject before Offer, Capability, or Reader authority is consulted', async () => {
    const ports = createPorts();
    await expectApiCode(
      createStandardReadingPurchaseIntentV4({
        request: {
          productOfferId: OFFER_ID,
          idempotencyKey: 'auth-v4',
          readerCharacterId: READER_ID,
        },
        ...ports,
      }),
      'AUTH_REQUIRED',
    );
    expect(ports.offerSnapshotPort.calls).toHaveLength(0);
    expect(ports.capabilitySnapshotPort.calls).toHaveLength(0);
    expect(ports.readerSelectionPort.calls).toHaveLength(0);
  });

  it('fails closed before Reader resolution and identity allocation when Offer Capability authority is unavailable', async () => {
    const ports = createPorts();
    ports.capabilitySnapshotPort.result = null;
    await expectApiCode(
      createStandardReadingPurchaseIntentV4({
        resolvedSubjectId: SUBJECT_ID,
        request: {
          productOfferId: OFFER_ID,
          idempotencyKey: 'missing-cap-v4',
          readerCharacterId: READER_ID,
        },
        ...ports,
      }),
      'NOT_FOUND',
    );
    expect(ports.readerSelectionPort.calls).toHaveLength(0);
    expect(ports.idPort.calls).toBe(0);
    expect(ports.authorityPort.calls).toHaveLength(0);
  });

  it('fails closed when the selected Reader has no already-authoritative eligible access resolution', async () => {
    const ports = createPorts();
    ports.readerSelectionPort.result = null;
    await expectApiCode(
      createStandardReadingPurchaseIntentV4({
        resolvedSubjectId: SUBJECT_ID,
        request: {
          productOfferId: OFFER_ID,
          idempotencyKey: 'reader-unavailable-v4',
          readerCharacterId: READER_ID,
        },
        ...ports,
      }),
      'NOT_FOUND',
    );
    expect(ports.idPort.calls).toBe(0);
    expect(ports.authorityPort.calls).toHaveLength(0);
  });

  it('rejects trusted Reader resolver identity drift instead of converting it into purchase authority', async () => {
    for (const mutation of [
      { productId: 'd1074000-0000-0000-0000-000000000099' },
      { readerCharacterId: OTHER_READER_ID },
      { readerContentBundleId: '' },
      { topicKey: '' },
      { specVersion: '' },
    ]) {
      const ports = createPorts();
      ports.readerSelectionPort.result = { ...READER_RESOLUTION, ...mutation };
      await expect(
        createStandardReadingPurchaseIntentV4({
          resolvedSubjectId: SUBJECT_ID,
          request: {
            productOfferId: OFFER_ID,
            idempotencyKey: 'reader-drift-v4',
            readerCharacterId: READER_ID,
          },
          ...ports,
        }),
      ).rejects.toThrow(/Standard Reading/);
      expect(ports.idPort.calls).toBe(0);
      expect(ports.authorityPort.calls).toHaveLength(0);
    }
  });

  it('includes Reader identity in the trusted v4 request hash', async () => {
    const first = createPorts();
    await createStandardReadingPurchaseIntentV4({
      resolvedSubjectId: SUBJECT_ID,
      request: {
        productOfferId: OFFER_ID,
        idempotencyKey: 'reader-hash-v4',
        readerCharacterId: READER_ID,
      },
      ...first,
    });

    const second = createPorts();
    second.readerSelectionPort.result = {
      ...READER_RESOLUTION,
      readerCharacterId: OTHER_READER_ID,
    };
    await createStandardReadingPurchaseIntentV4({
      resolvedSubjectId: SUBJECT_ID,
      request: {
        productOfferId: OFFER_ID,
        idempotencyKey: 'reader-hash-v4',
        readerCharacterId: OTHER_READER_ID,
      },
      ...second,
    });

    expect(first.authorityPort.calls[0]?.requestHash).not.toBe(
      second.authorityPort.calls[0]?.requestHash,
    );

    const third = createPorts();
    await createStandardReadingPurchaseIntentV4({
      resolvedSubjectId: SUBJECT_ID,
      request: {
        productOfferId: OFFER_ID,
        idempotencyKey: 'different-idempotency-key-v4',
        readerCharacterId: READER_ID,
      },
      ...third,
    });
    expect(first.authorityPort.calls[0]?.requestHash).toBe(
      third.authorityPort.calls[0]?.requestHash,
    );
  });

  it('rejects any Reader Character, bundle, snapshot, or hash drift returned by DB authority', async () => {
    for (const mutation of [
      { readerCharacterId: OTHER_READER_ID },
      { readerContentBundleId: 'd1074000-0000-0000-0000-000000000099' },
      { readerSelectionSnapshotJsonb: { forged: true } },
      { readerSelectionHash: 'sha256:v1:wrong' },
    ]) {
      const ports = createPorts();
      ports.authorityPort.createPurchaseIntent = function (input: AuthorityCall) {
        this.calls.push(input);
        return [{
          purchaseIntentId: input.purchaseIntentId,
          productOfferId: input.productOfferId,
          providerAccountLinkId: null,
          status: 'created',
          offerSnapshotJsonb: input.offerSnapshotJsonb,
          offerSnapshotHash: input.offerSnapshotHash,
          expectedAmountMinor: 8900,
          expectedCurrency: 'KRW',
          chargeTermsVersion: 'future-charge-v1',
          capabilitySetId: input.capabilitySnapshotJsonb.capabilitySetId,
          capabilitySnapshotJsonb: input.capabilitySnapshotJsonb,
          capabilitySnapshotHash: input.capabilitySnapshotHash,
          readerCharacterId: input.readerCharacterId,
          readerContentBundleId: input.readerContentBundleId,
          readerSelectionSnapshotJsonb: input.readerSelectionSnapshotJsonb,
          readerSelectionHash: input.readerSelectionHash,
          replayed: false,
          ...mutation,
        }];
      };

      await expect(
        createStandardReadingPurchaseIntentV4({
          resolvedSubjectId: SUBJECT_ID,
          request: {
            productOfferId: OFFER_ID,
            idempotencyKey: 'db-reader-drift-v4',
            readerCharacterId: READER_ID,
          },
          ...ports,
        }),
      ).rejects.toThrow(/authority returned a different Reader/);
    }
  });

  it('preserves exact replay while keeping Reader-unavailable public and provenance corruption internal', async () => {
    const replay = createPorts();
    replay.authorityPort.createPurchaseIntent = function (input: AuthorityCall) {
      this.calls.push(input);
      return [{
        purchaseIntentId: REPLAY_INTENT_ID,
        productOfferId: input.productOfferId,
        providerAccountLinkId: null,
        status: 'verified',
        offerSnapshotJsonb: input.offerSnapshotJsonb,
        offerSnapshotHash: input.offerSnapshotHash,
        expectedAmountMinor: 8900,
        expectedCurrency: 'KRW',
        chargeTermsVersion: 'future-charge-v1',
        capabilitySetId: input.capabilitySnapshotJsonb.capabilitySetId,
        capabilitySnapshotJsonb: input.capabilitySnapshotJsonb,
        capabilitySnapshotHash: input.capabilitySnapshotHash,
        readerCharacterId: input.readerCharacterId,
        readerContentBundleId: input.readerContentBundleId,
        readerSelectionSnapshotJsonb: input.readerSelectionSnapshotJsonb,
        readerSelectionHash: input.readerSelectionHash,
        replayed: true,
      }];
    };
    await expect(
      createStandardReadingPurchaseIntentV4({
        resolvedSubjectId: SUBJECT_ID,
        request: {
          productOfferId: OFFER_ID,
          idempotencyKey: 'replay-reader-v4',
          readerCharacterId: READER_ID,
        },
        ...replay,
      }),
    ).resolves.toEqual({ purchaseIntentId: REPLAY_INTENT_ID, status: 'verified' });

    const unavailable = createPorts();
    unavailable.authorityPort.result = new StandardReadingPurchaseIntentAuthorityPortErrorV4(
      'READER_UNAVAILABLE',
      'raw reader detail',
    );
    const error = await expectApiCode(
      createStandardReadingPurchaseIntentV4({
        resolvedSubjectId: SUBJECT_ID,
        request: {
          productOfferId: OFFER_ID,
          idempotencyKey: 'reader-race-v4',
          readerCharacterId: READER_ID,
        },
        ...unavailable,
      }),
      'NOT_FOUND',
    );
    expect(error.message).not.toContain('raw reader');

    const corrupt = createPorts();
    corrupt.authorityPort.result = new StandardReadingPurchaseIntentAuthorityPortErrorV4(
      'READER_PROVENANCE_CONFLICT',
      'raw provenance detail',
    );
    await expect(
      createStandardReadingPurchaseIntentV4({
        resolvedSubjectId: SUBJECT_ID,
        request: {
          productOfferId: OFFER_ID,
          idempotencyKey: 'reader-corrupt-v4',
          readerCharacterId: READER_ID,
        },
        ...corrupt,
      }),
    ).rejects.toThrow('trusted Reader provenance');
  });

  it('does not activate checkout, payment, entitlement, or Saju execution in the application adapter', () => {
    const source = createStandardReadingPurchaseIntentV4.toString();
    expect(source).not.toContain('portone');
    expect(source).not.toContain('receipt');
    expect(source).not.toContain('entitlement');
    expect(source).not.toContain('saju');
    expect(source).not.toContain('paymentSuccess');
  });
});
