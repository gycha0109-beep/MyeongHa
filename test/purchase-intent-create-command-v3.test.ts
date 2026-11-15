import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/api-error.js';
import {
  APPROVED_SAJU_PURCHASE_POLICY_V1,
  type ApprovedSajuPurchaseAdmissionV1,
  type ApprovedSajuPurchaseAuthorityPortV1,
} from '../apps/api/src/commerce-approved-saju-purchase-admission-v1.js';
import { getApprovedSajuOfferV1 } from '../packages/contracts/src/approved-saju-catalog.js';
import {
  PURCHASE_INTENT_CREATE_AUTHORITY_BINDING_V3,
  PurchaseIntentCreateAuthorityPortErrorV3,
  createPurchaseIntentV3,
  type PurchaseIntentCapabilitySnapshotPortV3,
  type PurchaseIntentCapabilitySnapshotV3,
  type PurchaseIntentCreateAuthorityPortV3,
  type PurchaseIntentCreateAuthorityRowV3,
  type SajuPurchaseOriginInputV1,
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
type SajuAuthorityCall = Parameters<NonNullable<
  PurchaseIntentCreateAuthorityPortV3['createSajuPurchaseIntent']
>>[0];

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
  readonly sajuCalls:SajuAuthorityCall[]=[];
  result: readonly PurchaseIntentCreateAuthorityRowV3[] | Error | undefined;

  createSajuPurchaseIntent(input:SajuAuthorityCall):readonly PurchaseIntentCreateAuthorityRowV3[] {
    this.sajuCalls.push(input);
    if(this.result instanceof Error)throw this.result;
    if(this.result!==undefined)return this.result;
    return [{
      purchaseIntentId:input.purchaseIntentId,
      productOfferId:input.productOfferId,
      providerAccountLinkId:null,
      status:'created',
      offerSnapshotJsonb:input.offerSnapshotJsonb,
      offerSnapshotHash:input.offerSnapshotHash,
      expectedAmountMinor:12900,
      expectedCurrency:'KRW',
      chargeTermsVersion:'charge-v3',
      capabilitySetId:input.capabilitySnapshotJsonb.capabilitySetId,
      capabilitySnapshotJsonb:input.capabilitySnapshotJsonb,
      capabilitySnapshotHash:input.capabilitySnapshotHash,
      replayed:false,
    }];
  }

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

const LAUNCH_ORIGIN: SajuPurchaseOriginInputV1 = {
  sajuRecordId: 'c1070000-0000-0000-0000-000000000011',
  birthRevisionId: 'c1070000-0000-0000-0000-000000000012',
  purchaseKind: 'original',
  sourceReceiptIds: [],
};
const TARGET_ID = 'c1070000-0000-0000-0000-000000000013';
const TARGET_REVISION = 'c1070000-0000-0000-0000-000000000014';

function launchPorts(offerId: string) {
  const offer = getApprovedSajuOfferV1(offerId);
  if (offer === undefined) throw new Error('Unknown fixture offer.');
  const ports = createPorts();
  ports.offerSnapshotPort.result = { ...OFFER_SNAPSHOT, provider: 'portone_v2' };
  const target = offer.counterpartOrder === undefined ? undefined : {
    targetPersonId: TARGET_ID, targetBirthRevisionId: TARGET_REVISION,
    order: offer.counterpartOrder, useApprovalRef: 'reviewed-use-synthetic',
  };
  const fixture: ApprovedSajuPurchaseAdmissionV1 = {
    policy: APPROVED_SAJU_PURCHASE_POLICY_V1,
    approvedOfferId: offerId,
    subjectId: SUBJECT_ID,
    sajuRecordId: LAUNCH_ORIGIN.sajuRecordId,
    birthRevisionId: LAUNCH_ORIGIN.birthRevisionId,
    productOfferId: OFFER_ID,
    capabilitySetId: CAPABILITY_SET_ID,
    currency: 'KRW',
    amountMinor: offer.priceKrw,
    components: offer.components.map(component => ({
      component, authority: 'official_fulfillment', releaseRef: `fixture-release-${component}`,
    })),
    ...(offer.components.includes('year') || offer.components.includes('month')
      ? { periodReferenceDateTime: '2026-11-30T14:59:59.999Z' }
      : {}),
    ...(target === undefined ? {} : { counterpart: target }),
  };
  const calls: Parameters<ApprovedSajuPurchaseAuthorityPortV1['createPurchaseIntent']>[0][] = [];
  const state = { admission: fixture as ApprovedSajuPurchaseAdmissionV1 | null, incorrectCharge: false };
  const authority: ApprovedSajuPurchaseAuthorityPortV1 = {
    resolveAdmission: () => state.admission,
    createPurchaseIntent(input) {
      calls.push(input);
      return [{
        purchaseIntentId: input.purchaseIntentId,
        productOfferId: input.productOfferId,
        providerAccountLinkId: null,
        status: 'created',
        offerSnapshotJsonb: input.offerSnapshotJsonb,
        offerSnapshotHash: input.offerSnapshotHash,
        expectedAmountMinor: input.approvedSajuAdmission.amountMinor + (state.incorrectCharge ? 1 : 0),
        expectedCurrency: 'KRW',
        chargeTermsVersion: 'synthetic-approved-terms',
        capabilitySetId: input.capabilitySnapshotJsonb.capabilitySetId,
        capabilitySnapshotJsonb: input.capabilitySnapshotJsonb,
        capabilitySnapshotHash: input.capabilitySnapshotHash,
        approvedSajuAdmissionHash: input.approvedSajuAdmissionHash,
        replayed: false,
      }];
    },
  };
  const command = {
    ...ports,
    resolvedSubjectId: SUBJECT_ID,
    sajuOrigin: LAUNCH_ORIGIN,
    request: { productOfferId: OFFER_ID, idempotencyKey: 'approved-catalog-v1' },
    approvedSaju: { offerId, authority, ...(target === undefined ? {} : { targetPersonId: TARGET_ID }) },
  };
  return { command, calls, fixture, state, ports };
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
  it.each([
    ['career', 9900], ['business', 9900], ['wealth', 9900], ['relationship', 9900],
    ['year', 7900], ['month', 4900], ['first-counterpart', 12900],
    ['additional-counterpart', 9900], ['relationship-plus-first', 19900],
    ['career-economy', 24900], ['basic', 29900], ['basic-year', 35800],
    ['basic-month', 33800], ['basic-year-month', 39700],
  ] as const)('checks the approved %s offer before invoking its scoped writer', async (offerId, price) => {
    const { command, calls, ports } = launchPorts(offerId);
    await expect(createPurchaseIntentV3(command)).resolves.toEqual({ purchaseIntentId: INTENT_ID, status: 'created' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.approvedSajuAdmission.amountMinor).toBe(price);
    expect(calls[0]?.approvedSajuAdmissionHash).toMatch(/^sha256:v1:[0-9a-f]{64}$/u);
    expect(ports.authorityPort.sajuCalls).toHaveLength(0);
    expect(ports.authorityPort.calls).toHaveLength(0);
  });

  it('fails closed before allocating an intent for a stale price, missing reading or wrong scope', async () => {
    const { command, calls, fixture, state, ports } = launchPorts('basic-year-month');
    const { periodReferenceDateTime: _period, ...withoutPeriod } = fixture;
    for (const mismatch of [
      null,
      { ...fixture, amountMinor: 34900 },
      { ...fixture, subjectId: TARGET_ID },
      { ...fixture, birthRevisionId: TARGET_REVISION },
      withoutPeriod,
      { ...fixture, components: fixture.components.slice(1) },
      { ...fixture, components: fixture.components.map(entry => ({ ...entry, releaseRef: '' })) },
    ]) {
      state.admission = mismatch;
      await expectApiCode(createPurchaseIntentV3(command), 'NOT_FOUND');
    }
    expect(ports.idPort.calls).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('requires the selected counterpart, verified order and use approval', async () => {
    const { command, calls, fixture, state } = launchPorts('additional-counterpart');
    const counterpart = fixture.counterpart!;
    for (const mismatch of [
      { ...counterpart, targetPersonId: SUBJECT_ID },
      { ...counterpart, order: 'first' as const },
      { ...counterpart, targetBirthRevisionId: LAUNCH_ORIGIN.birthRevisionId },
      { ...counterpart, useApprovalRef: '' },
    ]) {
      state.admission = { ...fixture, counterpart: mismatch };
      await expectApiCode(createPurchaseIntentV3(command), 'NOT_FOUND');
    }
    expect(calls).toHaveLength(0);
  });

  it('keeps the approved period and target in the intent identity and rejects a different returned price', async () => {
    const year = launchPorts('year');
    await createPurchaseIntentV3(year.command);
    year.state.admission = { ...year.fixture, periodReferenceDateTime: '2027-01-01T00:00:00.000Z' };
    await createPurchaseIntentV3(year.command);
    expect(year.calls[0]?.requestHash).not.toBe(year.calls[1]?.requestHash);

    const comparison = launchPorts('first-counterpart');
    await createPurchaseIntentV3(comparison.command);
    comparison.state.admission = {
      ...comparison.fixture, counterpart: { ...comparison.fixture.counterpart!, targetBirthRevisionId: PRODUCT_ID },
    };
    comparison.state.incorrectCharge = true;
    await expect(createPurchaseIntentV3(comparison.command)).rejects.toThrow('did not bind the approved Saju admission');
    expect(comparison.calls[0]?.requestHash).not.toBe(comparison.calls[1]?.requestHash);
  });
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

  it('uses the Record-scoped admission port only for trusted server-side Saju origin context', async () => {
    const ports=createPorts();
    const sajuOrigin:SajuPurchaseOriginInputV1={
      sajuRecordId:'c1070000-0000-0000-0000-000000000011',
      birthRevisionId:'c1070000-0000-0000-0000-000000000012',
      purchaseKind:'original',
      sourceReceiptIds:[],
    };
    const response=await createPurchaseIntentV3({
      resolvedSubjectId:SUBJECT_ID,
      request:{productOfferId:OFFER_ID,idempotencyKey:'saju-record-v1'},
      sajuOrigin,
      ...ports,
    });
    expect(ports.authorityPort.calls).toHaveLength(0);
    expect(ports.authorityPort.sajuCalls).toHaveLength(1);
    expect(ports.authorityPort.sajuCalls[0]?.sajuOrigin).toEqual(sajuOrigin);
    expect(ports.authorityPort.sajuCalls[0]?.requestHash).toMatch(/^sha256:v1:[0-9a-f]{64}$/);
    expect(response).toEqual({purchaseIntentId:INTENT_ID,status:'created'});
    expect(response).not.toHaveProperty('sajuRecordId');
    expect(response).not.toHaveProperty('scopeKey');
  });

  it('binds the idempotency hash to the exact Saju Record and Birth revision', async () => {
    const first=createPorts();
    const second=createPorts();
    const common={
      resolvedSubjectId:SUBJECT_ID,
      request:{productOfferId:OFFER_ID,idempotencyKey:'saju-record-hash'},
    };
    await createPurchaseIntentV3({
      ...common,...first,
      sajuOrigin:{
        sajuRecordId:'c1070000-0000-0000-0000-000000000011',
        birthRevisionId:'c1070000-0000-0000-0000-000000000012',
        purchaseKind:'original',sourceReceiptIds:[],
      },
    });
    await createPurchaseIntentV3({
      ...common,...second,
      sajuOrigin:{
        sajuRecordId:'c1070000-0000-0000-0000-000000000013',
        birthRevisionId:'c1070000-0000-0000-0000-000000000014',
        purchaseKind:'original',sourceReceiptIds:[],
      },
    });
    expect(first.authorityPort.sajuCalls[0]?.requestHash)
      .not.toBe(second.authorityPort.sajuCalls[0]?.requestHash);
  });

  it('rejects malformed Saju Record context before allocating a Purchase Intent id', async () => {
    const ports=createPorts();
    await expectApiCode(createPurchaseIntentV3({
      resolvedSubjectId:SUBJECT_ID,
      request:{productOfferId:OFFER_ID,idempotencyKey:'saju-invalid-origin'},
      sajuOrigin:{
        sajuRecordId:'client-scope-key',
        birthRevisionId:'c1070000-0000-0000-0000-000000000012',
        purchaseKind:'original',sourceReceiptIds:[],
      },
      ...ports,
    }),'INVALID_REQUEST');
    expect(ports.idPort.calls).toBe(0);
    expect(ports.authorityPort.calls).toHaveLength(0);
    expect(ports.authorityPort.sajuCalls).toHaveLength(0);
  });

  it('rejects client attempts to inject capability, entitlement, monetary, owner, or status authority', async () => {
    for (const extra of [
      { capabilitySetId: CAPABILITY_SET_ID },
      { definitionVersion: 'client-v' },
      { definitionHash: 'client-hash' },
      { capabilitySnapshotHash: 'client-snapshot-hash' },
      { entitlementKey: 'reading.full' },
      { scopeMode: 'global' },
      { scopeKey: 'saju-record:client-controlled' },
      { sajuRecordId: 'c1070000-0000-0000-0000-000000000011' },
      { birthRevisionId: 'c1070000-0000-0000-0000-000000000012' },
      { entitlementKey: 'saju.relationship' },
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
