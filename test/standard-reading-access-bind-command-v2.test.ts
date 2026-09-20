import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../packages/domain/src/index.js';
import { ApiCommandError } from '../apps/api/src/api-error.js';
import {
  STANDARD_READING_ACCESS_BIND_AUTHORITY_BINDING_V2,
  STANDARD_READING_ACCESS_REQUEST_CONTRACT_VERSION_V2,
  StandardReadingAccessBindAuthorityPortErrorV2,
  bindStandardReadingAccessV2,
  type StandardReadingAccessBindAuthorityPortV2,
  type StandardReadingAccessBindAuthorityRowV2,
  type StandardReadingAccessBindIdPortV2,
} from '../apps/api/src/standard-reading-access-bind-command-v2.js';

const SUBJECT_ID = 'd1210000-0000-0000-0000-000000000001';
const PURCHASE_INTENT_ID = 'd1210000-0000-0000-0000-000000000002';
const SESSION_ID = 'd1210000-0000-0000-0000-000000000003';
const READING_ID = 'd1210000-0000-0000-0000-000000000004';
const EXISTING_SESSION_ID = 'd1210000-0000-0000-0000-000000000005';
const EXISTING_READING_ID = 'd1210000-0000-0000-0000-000000000006';
const GRANT_ID = 'd1210000-0000-0000-0000-000000000007';
const PRODUCT_ID = 'd1210000-0000-0000-0000-000000000008';
const BUNDLE_ID = 'd1210000-0000-0000-0000-000000000009';
const SOURCE_REVISION_ID = 'd1210000-0000-0000-0000-000000000010';

type AuthorityInput = Parameters<StandardReadingAccessBindAuthorityPortV2['bindAccess']>[0];

class FakeIdPort implements StandardReadingAccessBindIdPortV2 {
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

function authorityRow(
  input: AuthorityInput,
  overrides: Partial<StandardReadingAccessBindAuthorityRowV2> = {},
): StandardReadingAccessBindAuthorityRowV2 {
  return {
    purchaseIntentId: input.purchaseIntentId,
    entitlementGrantId: GRANT_ID,
    productId: PRODUCT_ID,
    readerCharacterId: 'baekheon',
    readerContentBundleId: BUNDLE_ID,
    readingSessionId: input.proposedReadingSessionId,
    readingId: input.proposedReadingId,
    sourceBirthRevisionId: SOURCE_REVISION_ID,
    sajuDomain: 'relationship',
    domainCapabilityVersion: 'relationship-v2',
    accessRole: 'initial_reader',
    officialReadingCreated: true,
    interpretationCreated: true,
    replayed: false,
    ...overrides,
  };
}

class FakeAuthorityPort implements StandardReadingAccessBindAuthorityPortV2 {
  readonly calls: AuthorityInput[] = [];
  result: readonly StandardReadingAccessBindAuthorityRowV2[] | Error | undefined;

  bindAccess(input: AuthorityInput): readonly StandardReadingAccessBindAuthorityRowV2[] {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    if (this.result !== undefined) return this.result;
    return [authorityRow(input)];
  }
}

function ports() {
  return {
    idPort: new FakeIdPort(),
    authorityPort: new FakeAuthorityPort(),
  };
}

function request() {
  return { purchaseIntentId: PURCHASE_INTENT_ID } as const;
}

function expectedSnapshot() {
  return {
    schemaVersion: STANDARD_READING_ACCESS_REQUEST_CONTRACT_VERSION_V2,
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

describe('Official Standard Reading + Reader access bind command v2', () => {
  it('pins the v2 authority and client-minimal request contract', () => {
    expect(STANDARD_READING_ACCESS_BIND_AUTHORITY_BINDING_V2).toBe(
      'public.cmd_bind_standard_reading_access_v2',
    );
    expect(STANDARD_READING_ACCESS_REQUEST_CONTRACT_VERSION_V2).toBe(
      'standard-reading-access-bind-v2',
    );
  });

  it('creates an initial Reader access while accepting only Purchase Intent from the client', async () => {
    const p = ports();
    const result = await bindStandardReadingAccessV2({
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
      domainCapabilityVersion: 'relationship-v2',
      accessRole: 'initial_reader',
      officialReadingCreated: true,
      interpretationCreated: true,
    });
    expect(result).not.toHaveProperty('entitlementGrantId');

    const snapshot = expectedSnapshot();
    expect(p.authorityPort.calls).toEqual([{
      subjectId: SUBJECT_ID,
      purchaseIntentId: PURCHASE_INTENT_ID,
      proposedReadingSessionId: SESSION_ID,
      proposedReadingId: READING_ID,
      requestHash: expectedHash(snapshot),
      requestContractVersion: STANDARD_READING_ACCESS_REQUEST_CONTRACT_VERSION_V2,
      requestSnapshotJsonb: snapshot,
    }]);
  });

  it('accepts Additional Reader reuse of an existing official Reading instead of requiring proposed ids', async () => {
    const p = ports();
    p.authorityPort.result = [authorityRow({
      subjectId: SUBJECT_ID,
      purchaseIntentId: PURCHASE_INTENT_ID,
      proposedReadingSessionId: SESSION_ID,
      proposedReadingId: READING_ID,
      requestHash: 'unused',
      requestContractVersion: STANDARD_READING_ACCESS_REQUEST_CONTRACT_VERSION_V2,
      requestSnapshotJsonb: expectedSnapshot(),
    }, {
      readingSessionId: EXISTING_SESSION_ID,
      readingId: EXISTING_READING_ID,
      accessRole: 'additional_reader',
      officialReadingCreated: false,
      interpretationCreated: true,
    })];

    const result = await bindStandardReadingAccessV2({
      resolvedSubjectId: SUBJECT_ID,
      request: request(),
      ...p,
    });

    expect(result.readingSessionId).toBe(EXISTING_SESSION_ID);
    expect(result.readingId).toBe(EXISTING_READING_ID);
    expect(result.accessRole).toBe('additional_reader');
    expect(result.officialReadingCreated).toBe(false);
  });

  it('accepts exact replay without duplicating Reader Interpretation identity', async () => {
    const p = ports();
    p.authorityPort.result = [authorityRow({
      subjectId: SUBJECT_ID,
      purchaseIntentId: PURCHASE_INTENT_ID,
      proposedReadingSessionId: SESSION_ID,
      proposedReadingId: READING_ID,
      requestHash: 'unused',
      requestContractVersion: STANDARD_READING_ACCESS_REQUEST_CONTRACT_VERSION_V2,
      requestSnapshotJsonb: expectedSnapshot(),
    }, {
      readingSessionId: EXISTING_SESSION_ID,
      readingId: EXISTING_READING_ID,
      accessRole: 'additional_reader',
      officialReadingCreated: false,
      interpretationCreated: false,
      replayed: true,
    })];

    const result = await bindStandardReadingAccessV2({
      resolvedSubjectId: SUBJECT_ID,
      request: request(),
      ...p,
    });
    expect(result.readingId).toBe(EXISTING_READING_ID);
    expect(result.interpretationCreated).toBe(false);
  });

  it('rejects client authority injection before trusted ids or DB authority run', async () => {
    for (const extra of [
      { readerCharacterId: 'seyeon' },
      { productId: PRODUCT_ID },
      { readingId: READING_ID },
      { officialReadingId: EXISTING_READING_ID },
      { entitlementGrantId: GRANT_ID },
      { sajuDomain: 'general' },
    ]) {
      const p = ports();
      await expectApiCode(
        bindStandardReadingAccessV2({
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

  it('maps bounded authority failures without leaking persistence detail', async () => {
    const cases = [
      ['SUBJECT_INELIGIBLE', 'NOT_FOUND'],
      ['PURCHASE_UNAVAILABLE', 'NOT_FOUND'],
      ['READER_PROVENANCE_UNAVAILABLE', 'CAPABILITY_UNAVAILABLE'],
      ['CAPABILITY_UNAVAILABLE', 'CAPABILITY_UNAVAILABLE'],
      ['ENTITLEMENT_UNAVAILABLE', 'CAPABILITY_UNAVAILABLE'],
      ['ENTITLEMENT_AMBIGUOUS', 'CAPABILITY_UNAVAILABLE'],
      ['SOURCE_PROFILE_NOT_FOUND', 'NOT_FOUND'],
      ['SOURCE_PROFILE_NOT_READY', 'CAPABILITY_UNAVAILABLE'],
      ['DOMAIN_UNAVAILABLE', 'CAPABILITY_UNAVAILABLE'],
      ['READER_CAPABILITY_UNAVAILABLE', 'CAPABILITY_UNAVAILABLE'],
      ['OFFICIAL_READING_NOT_REUSABLE', 'CAPABILITY_UNAVAILABLE'],
      ['ADDITIONAL_REQUIRES_OFFICIAL', 'CAPABILITY_UNAVAILABLE'],
      ['INITIAL_OFFICIAL_CONFLICT', 'IDEMPOTENCY_CONFLICT'],
      ['IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT'],
      ['BINDING_CONFLICT', 'IDEMPOTENCY_CONFLICT'],
      ['INVALID_INPUT', 'INVALID_REQUEST'],
    ] as const;

    for (const [authorityCode, apiCode] of cases) {
      const p = ports();
      p.authorityPort.result = new StandardReadingAccessBindAuthorityPortErrorV2(
        authorityCode,
        `raw persistence detail ${authorityCode}`,
      );
      const error = await expectApiCode(
        bindStandardReadingAccessV2({
          resolvedSubjectId: SUBJECT_ID,
          request: request(),
          ...p,
        }),
        apiCode,
      );
      expect(error.message).not.toContain('raw persistence detail');
    }
  });

  it('fails closed on contradictory or malformed authority provenance', async () => {
    const baseInput: AuthorityInput = {
      subjectId: SUBJECT_ID,
      purchaseIntentId: PURCHASE_INTENT_ID,
      proposedReadingSessionId: SESSION_ID,
      proposedReadingId: READING_ID,
      requestHash: 'unused',
      requestContractVersion: STANDARD_READING_ACCESS_REQUEST_CONTRACT_VERSION_V2,
      requestSnapshotJsonb: expectedSnapshot(),
    };
    const badRows: readonly (readonly StandardReadingAccessBindAuthorityRowV2[])[] = [
      [],
      [authorityRow(baseInput, { purchaseIntentId: 'd1210000-0000-0000-0000-000000000099' })],
      [authorityRow(baseInput, {
        accessRole: 'additional_reader',
        officialReadingCreated: true,
      })],
      [authorityRow(baseInput, {
        readingId: EXISTING_READING_ID,
        officialReadingCreated: true,
      })],
    ];

    for (const rows of badRows) {
      const p = ports();
      p.authorityPort.result = rows;
      await expect(
        bindStandardReadingAccessV2({
          resolvedSubjectId: SUBJECT_ID,
          request: request(),
          ...p,
        }),
      ).rejects.toBeInstanceOf(Error);
    }
  });
});
