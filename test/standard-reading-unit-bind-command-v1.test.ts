import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../packages/domain/src/index.js';
import { ApiCommandError } from '../apps/api/src/api-error.js';
import {
  STANDARD_READING_UNIT_BIND_AUTHORITY_BINDING_V1,
  STANDARD_READING_UNIT_REQUEST_CONTRACT_VERSION_V1,
  StandardReadingUnitBindAuthorityPortErrorV1,
  bindStandardReadingUnitV1,
  type StandardReadingUnitBindAuthorityPortV1,
  type StandardReadingUnitBindAuthorityRowV1,
  type StandardReadingUnitBindIdPortV1,
} from '../apps/api/src/standard-reading-unit-bind-command-v1.js';

const SUBJECT_ID = 'd1089000-0000-0000-0000-000000000001';
const PURCHASE_INTENT_ID = 'd1089000-0000-0000-0000-000000000002';
const SOURCE_PROFILE_ID = 'd1089000-0000-0000-0000-000000000003';
const SOURCE_REVISION_ID = 'd1089000-0000-0000-0000-000000000004';
const SESSION_ID = 'd1089000-0000-0000-0000-000000000005';
const READING_ID = 'd1089000-0000-0000-0000-000000000006';
const GRANT_ID = 'd1089000-0000-0000-0000-000000000007';
const PRODUCT_ID = '11300000-0000-0000-0000-000000000001';
const BUNDLE_ID = 'd1089000-0000-0000-0000-000000000008';

type AuthorityCall = Parameters<StandardReadingUnitBindAuthorityPortV1['bindUnit']>[0];

class FakeIdPort implements StandardReadingUnitBindIdPortV1 {
  sessionCalls = 0;
  readingCalls = 0;

  nextReadingSessionId(): string {
    this.sessionCalls += 1;
    return SESSION_ID;
  }

  nextReadingId(): string {
    this.readingCalls += 1;
    return READING_ID;
  }
}

class FakeAuthorityPort implements StandardReadingUnitBindAuthorityPortV1 {
  readonly calls: AuthorityCall[] = [];
  result: readonly StandardReadingUnitBindAuthorityRowV1[] | Error | undefined;

  bindUnit(input: AuthorityCall): readonly StandardReadingUnitBindAuthorityRowV1[] {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    if (this.result !== undefined) return this.result;
    return [{
      purchaseIntentId: input.purchaseIntentId,
      entitlementGrantId: GRANT_ID,
      productId: PRODUCT_ID,
      readerCharacterId: 'baekheon',
      readerContentBundleId: BUNDLE_ID,
      readingSessionId: input.readingSessionId,
      readingId: input.readingId,
      attemptNo: 1,
      sourceBirthRevisionId: SOURCE_REVISION_ID,
      sajuDomain: 'relationship',
      domainCapabilityVersion: 'relationship-v1',
      replayed: false,
    }];
  }
}

function ports() {
  return {
    idPort: new FakeIdPort(),
    authorityPort: new FakeAuthorityPort(),
  };
}

function request() {
  return {
    purchaseIntentId: PURCHASE_INTENT_ID,
  } as const;
}

function expectedSnapshot() {
  return {
    schemaVersion: STANDARD_READING_UNIT_REQUEST_CONTRACT_VERSION_V1,
    purchaseIntentId: PURCHASE_INTENT_ID,
  } as const;
}

function expectedHash(value: unknown): string {
  return `sha256:v1:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
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

describe('Standard Reading purchase-unit bind command v1', () => {
  it('pins the exact unactivated DB authority and request contract', () => {
    expect(STANDARD_READING_UNIT_BIND_AUTHORITY_BINDING_V1).toBe(
      'public.cmd_bind_standard_reading_unit_v1',
    );
    expect(STANDARD_READING_UNIT_REQUEST_CONTRACT_VERSION_V1).toBe(
      'standard-reading-unit-request-v1',
    );
  });

  it('accepts only purchase intent + source profile and derives all Reader/Product/Grant authority server-side', async () => {
    const p = ports();
    const result = await bindStandardReadingUnitV1({
      resolvedSubjectId: SUBJECT_ID,
      request: request(),
      ...p,
    });

    expect(result).toEqual({
      purchaseIntentId: PURCHASE_INTENT_ID,
      productId: PRODUCT_ID,
      readerCharacterId: 'baekheon',
      readerContentBundleId: BUNDLE_ID,
      readingSessionId: SESSION_ID,
      readingId: READING_ID,
      sourceBirthRevisionId: SOURCE_REVISION_ID,
      sajuDomain: 'relationship',
      domainCapabilityVersion: 'relationship-v1',
    });
    expect(result).not.toHaveProperty('entitlementGrantId');

    const snapshot = expectedSnapshot();
    expect(p.authorityPort.calls).toEqual([{
      subjectId: SUBJECT_ID,
      purchaseIntentId: PURCHASE_INTENT_ID,
      readingSessionId: SESSION_ID,
      readingId: READING_ID,
      requestHash: expectedHash(snapshot),
      requestContractVersion: STANDARD_READING_UNIT_REQUEST_CONTRACT_VERSION_V1,
      requestSnapshotJsonb: snapshot,
    }]);
  });

  it('rejects client attempts to inject Reader, Product, Grant, Reading identity, or Saju semantics before trusted ports run', async () => {
    const injected = [
      { readerCharacterId: 'rahyeon' },
      { readerContentBundleId: BUNDLE_ID },
      { productId: PRODUCT_ID },
      { sourceBirthProfileId: SOURCE_PROFILE_ID },
      { entitlementGrantId: GRANT_ID },
      { readingId: READING_ID },
      { sajuDomain: 'general' },
    ];

    for (const extra of injected) {
      const p = ports();
      await expectApiCode(
        bindStandardReadingUnitV1({
          resolvedSubjectId: SUBJECT_ID,
          request: { ...request(), ...extra },
          ...p,
        }),
        'INVALID_REQUEST',
      );
      expect(p.idPort.sessionCalls).toBe(0);
      expect(p.idPort.readingCalls).toBe(0);
      expect(p.authorityPort.calls).toHaveLength(0);
    }
  });

  it('accepts exact authority replay and returns the already-bound Reading rather than proposed new ids', async () => {
    const p = ports();
    p.authorityPort.result = [{
      purchaseIntentId: PURCHASE_INTENT_ID,
      entitlementGrantId: GRANT_ID,
      productId: PRODUCT_ID,
      readerCharacterId: 'baekheon',
      readerContentBundleId: BUNDLE_ID,
      readingSessionId: 'd1089000-0000-0000-0000-000000000050',
      readingId: 'd1089000-0000-0000-0000-000000000051',
      attemptNo: 1,
      sourceBirthRevisionId: SOURCE_REVISION_ID,
      sajuDomain: 'relationship',
      domainCapabilityVersion: 'relationship-v1',
      replayed: true,
    }];

    const result = await bindStandardReadingUnitV1({
      resolvedSubjectId: SUBJECT_ID,
      request: request(),
      ...p,
    });

    expect(result.readingSessionId).toBe('d1089000-0000-0000-0000-000000000050');
    expect(result.readingId).toBe('d1089000-0000-0000-0000-000000000051');
  });

  it('fails closed before id allocation on auth or malformed request shape', async () => {
    const cases = [
      { resolvedSubjectId: undefined, request: request(), code: 'AUTH_REQUIRED' },
      {
        resolvedSubjectId: SUBJECT_ID,
        request: { ...request(), purchaseIntentId: '' },
        code: 'INVALID_REQUEST',
      },
      {
        resolvedSubjectId: SUBJECT_ID,
        request: { purchaseIntentId: 7 },
        code: 'INVALID_REQUEST',
      },
    ] as const;

    for (const testCase of cases) {
      const p = ports();
      await expectApiCode(
        bindStandardReadingUnitV1({
          ...(testCase.resolvedSubjectId === undefined
            ? {}
            : { resolvedSubjectId: testCase.resolvedSubjectId }),
          request: testCase.request,
          ...p,
        }),
        testCase.code,
      );
      expect(p.idPort.sessionCalls).toBe(0);
      expect(p.idPort.readingCalls).toBe(0);
      expect(p.authorityPort.calls).toHaveLength(0);
    }
  });

  it('maps bounded authority failures without leaking raw persistence details', async () => {
    const cases = [
      ['SUBJECT_INELIGIBLE', 'NOT_FOUND'],
      ['PURCHASE_UNAVAILABLE', 'NOT_FOUND'],
      ['READER_PROVENANCE_UNAVAILABLE', 'CAPABILITY_UNAVAILABLE'],
      ['CAPABILITY_UNAVAILABLE', 'CAPABILITY_UNAVAILABLE'],
      ['ENTITLEMENT_UNAVAILABLE', 'CAPABILITY_UNAVAILABLE'],
      ['ENTITLEMENT_AMBIGUOUS', 'CAPABILITY_UNAVAILABLE'],
      ['SOURCE_PROFILE_NOT_FOUND', 'NOT_FOUND'],
      ['SOURCE_PROFILE_NOT_READY', 'CAPABILITY_UNAVAILABLE'],
      ['PROFILE_CARDINALITY_INVALID', 'CAPABILITY_UNAVAILABLE'],
      ['DOMAIN_UNAVAILABLE', 'CAPABILITY_UNAVAILABLE'],
      ['READER_CAPABILITY_UNAVAILABLE', 'CAPABILITY_UNAVAILABLE'],
      ['IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT'],
      ['BINDING_CONFLICT', 'IDEMPOTENCY_CONFLICT'],
      ['INVALID_INPUT', 'INVALID_REQUEST'],
    ] as const;

    for (const [authorityCode, apiCode] of cases) {
      const p = ports();
      p.authorityPort.result = new StandardReadingUnitBindAuthorityPortErrorV1(
        authorityCode,
        `raw persistence detail ${authorityCode}`,
      );
      const error = await expectApiCode(
        bindStandardReadingUnitV1({
          resolvedSubjectId: SUBJECT_ID,
          request: request(),
          ...p,
        }),
        apiCode,
      );
      expect(error.message).not.toContain('raw persistence detail');
    }
  });

  it('fails closed on impossible authority cardinality or provenance shape', async () => {
    const badRows: readonly (readonly StandardReadingUnitBindAuthorityRowV1[])[] = [
      [],
      [{
        purchaseIntentId: 'd1089000-0000-0000-0000-000000000099',
        entitlementGrantId: GRANT_ID,
        productId: PRODUCT_ID,
        readerCharacterId: 'baekheon',
        readerContentBundleId: BUNDLE_ID,
        readingSessionId: SESSION_ID,
        readingId: READING_ID,
        attemptNo: 1,
        sourceBirthRevisionId: SOURCE_REVISION_ID,
        sajuDomain: 'relationship',
        domainCapabilityVersion: 'relationship-v1',
        replayed: false,
      }],
      [{
        purchaseIntentId: PURCHASE_INTENT_ID,
        entitlementGrantId: GRANT_ID,
        productId: PRODUCT_ID,
        readerCharacterId: 'baekheon',
        readerContentBundleId: BUNDLE_ID,
        readingSessionId: SESSION_ID,
        readingId: READING_ID,
        attemptNo: 2,
        sourceBirthRevisionId: SOURCE_REVISION_ID,
        sajuDomain: 'relationship',
        domainCapabilityVersion: 'relationship-v1',
        replayed: false,
      }],
    ];

    for (const rows of badRows) {
      const p = ports();
      p.authorityPort.result = rows;
      await expect(
        bindStandardReadingUnitV1({
          resolvedSubjectId: SUBJECT_ID,
          request: request(),
          ...p,
        }),
      ).rejects.toBeInstanceOf(Error);
    }
  });

  it('keeps infrastructure and trusted server-id conflicts internal', async () => {
    for (const error of [
      new Error('database unavailable'),
      new StandardReadingUnitBindAuthorityPortErrorV1(
        'SERVER_ID_CONFLICT',
        'raw server id conflict',
      ),
    ]) {
      const p = ports();
      p.authorityPort.result = error;
      await expect(
        bindStandardReadingUnitV1({
          resolvedSubjectId: SUBJECT_ID,
          request: request(),
          ...p,
        }),
      ).rejects.not.toBeInstanceOf(ApiCommandError);
    }
  });
});
