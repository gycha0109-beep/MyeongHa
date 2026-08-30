import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  ENTITLEMENTS_READ_AUTHORITY_BINDING_V1,
  EntitlementsReadAuthorityPortErrorV1,
  getEntitlements,
  type EntitlementCurrentAuthorityRowV1,
  type EntitlementsReadAuthorityPortV1,
  type EntitlementsReadClockV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = '9a000000-0000-0000-0000-000000000001';
const NOW = new Date('2026-08-30T03:00:00.000Z');

const ACTIVE_UNBOUNDED: EntitlementCurrentAuthorityRowV1 = Object.freeze({
  entitlementId: '9a100000-0000-0000-0000-000000000001',
  entitlementKey: 'reading.general',
  scopeKey: null,
  status: 'active',
  activeGrantCount: 2,
  effectiveValidUntil: null,
  revision: 7,
  updatedAt: '2026-08-30T02:00:00.000Z',
});

const INACTIVE_SCOPED: EntitlementCurrentAuthorityRowV1 = Object.freeze({
  entitlementId: '9a100000-0000-0000-0000-000000000002',
  entitlementKey: 'episode.special',
  scopeKey: 'episode-42',
  status: 'inactive',
  activeGrantCount: 0,
  effectiveValidUntil: '2026-07-01T00:00:00.000Z',
  revision: 4,
  updatedAt: '2026-07-02T00:00:00.000Z',
});

class FakeEntitlementsReadAuthorityPortV1 implements EntitlementsReadAuthorityPortV1 {
  readonly calls: Array<{ subjectId: string }> = [];
  result: readonly EntitlementCurrentAuthorityRowV1[] | Error = Object.freeze([
    INACTIVE_SCOPED,
    ACTIVE_UNBOUNDED,
  ]);

  readCurrentEntitlements(input: {
    readonly subjectId: string;
  }): readonly EntitlementCurrentAuthorityRowV1[] {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class FixedEntitlementsReadClockV1 implements EntitlementsReadClockV1 {
  constructor(private readonly value: Date) {}

  now(): Date {
    return this.value;
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

describe('Entitlements read API authority boundary', () => {
  it('pins GET /api/entitlements to the verified provider-independent projection query', () => {
    expect(ENTITLEMENTS_READ_AUTHORITY_BINDING_V1).toBe('public.qry_entitlements_v1');
  });

  it('returns stored current projections in authority order and derives only the source-defined access gate', async () => {
    const port = new FakeEntitlementsReadAuthorityPortV1();

    const result = await getEntitlements({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
      clock: new FixedEntitlementsReadClockV1(NOW),
    });

    expect(port.calls).toEqual([{ subjectId: SUBJECT_ID }]);
    expect(result).toEqual({
      entitlements: [
        { ...INACTIVE_SCOPED, accessAllowed: false },
        { ...ACTIVE_UNBOUNDED, accessAllowed: true },
      ],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.entitlements)).toBe(true);
    expect(Object.isFrozen(result.entitlements[0])).toBe(true);
  });

  it('fails closed on wall-clock expiry even when the stored projection still says active', async () => {
    const port = new FakeEntitlementsReadAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({
        ...ACTIVE_UNBOUNDED,
        entitlementId: '9a100000-0000-0000-0000-000000000003',
        entitlementKey: 'episode.expired',
        scopeKey: 'episode-expired',
        activeGrantCount: 1,
        effectiveValidUntil: '2026-08-30T02:59:59.999Z',
      }),
      Object.freeze({
        ...ACTIVE_UNBOUNDED,
        entitlementId: '9a100000-0000-0000-0000-000000000004',
        entitlementKey: 'episode.expires-now',
        scopeKey: 'episode-now',
        activeGrantCount: 1,
        effectiveValidUntil: NOW.toISOString(),
      }),
      Object.freeze({
        ...ACTIVE_UNBOUNDED,
        entitlementId: '9a100000-0000-0000-0000-000000000005',
        entitlementKey: 'episode.future',
        scopeKey: 'episode-future',
        activeGrantCount: 1,
        effectiveValidUntil: '2026-08-30T03:00:00.001Z',
      }),
    ]);

    const result = await getEntitlements({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
      clock: new FixedEntitlementsReadClockV1(NOW),
    });

    expect(result.entitlements.map((item) => item.accessAllowed)).toEqual([
      false,
      false,
      true,
    ]);
    expect(result.entitlements.map((item) => item.status)).toEqual([
      'active',
      'active',
      'active',
    ]);
  });

  it('returns an empty list without fabricating a baseline entitlement', async () => {
    const port = new FakeEntitlementsReadAuthorityPortV1();
    port.result = Object.freeze([]);

    await expect(getEntitlements({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
      clock: new FixedEntitlementsReadClockV1(NOW),
    })).resolves.toEqual({ entitlements: [] });
  });

  it('does not expose grants, entitlement events, product mapping, receipts, provider events, or mutation controls', async () => {
    const port = new FakeEntitlementsReadAuthorityPortV1();
    port.result = Object.freeze([
      {
        ...ACTIVE_UNBOUNDED,
        entitlementGrants: [{ grantKey: 'invented-grant' }],
        entitlementEvents: [{ eventType: 'renewed' }],
        productId: 'invented-product',
        sourceReceiptId: 'invented-receipt',
        providerOrderingKey: 'invented-order',
        recomputeEntitlement: true,
        canPurchase: true,
      } as EntitlementCurrentAuthorityRowV1,
    ]);

    const serialized = JSON.stringify(await getEntitlements({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
      clock: new FixedEntitlementsReadClockV1(NOW),
    }));

    for (const forbidden of [
      'entitlementGrants',
      'entitlementEvents',
      'productId',
      'sourceReceiptId',
      'providerOrderingKey',
      'recomputeEntitlement',
      'canPurchase',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('requires a trusted resolved subject before invoking DB authority', async () => {
    const port = new FakeEntitlementsReadAuthorityPortV1();

    await expectApiCode(
      getEntitlements({ authorityPort: port }),
      'AUTH_REQUIRED',
    );
    expect(port.calls).toHaveLength(0);
  });

  it('maps ineligible subject probes to bounded NOT_FOUND and authority input rejection to INVALID_REQUEST', async () => {
    const ineligiblePort = new FakeEntitlementsReadAuthorityPortV1();
    ineligiblePort.result = new EntitlementsReadAuthorityPortErrorV1(
      'SUBJECT_INELIGIBLE',
      'raw subject detail must stay hidden',
    );

    const notFound = await expectApiCode(
      getEntitlements({
        resolvedSubjectId: SUBJECT_ID,
        authorityPort: ineligiblePort,
        clock: new FixedEntitlementsReadClockV1(NOW),
      }),
      'NOT_FOUND',
    );
    expect(notFound.message).toBe('Entitlements are unavailable for the current subject.');
    expect(notFound.message).not.toContain('raw subject detail');

    const invalidPort = new FakeEntitlementsReadAuthorityPortV1();
    invalidPort.result = new EntitlementsReadAuthorityPortErrorV1(
      'INVALID_INPUT',
      'entitlement subject identity is required',
    );
    await expectApiCode(
      getEntitlements({
        resolvedSubjectId: SUBJECT_ID,
        authorityPort: invalidPort,
        clock: new FixedEntitlementsReadClockV1(NOW),
      }),
      'INVALID_REQUEST',
    );
  });

  it('fails closed on malformed stored projection shape instead of repairing or recomputing it', async () => {
    const invalidRows: EntitlementCurrentAuthorityRowV1[] = [
      { ...ACTIVE_UNBOUNDED, status: 'revoked' },
      { ...ACTIVE_UNBOUNDED, activeGrantCount: 0 },
      { ...INACTIVE_SCOPED, activeGrantCount: 1 },
      { ...ACTIVE_UNBOUNDED, scopeKey: '__GLOBAL__' },
      { ...ACTIVE_UNBOUNDED, effectiveValidUntil: 'not-a-timestamp' },
      { ...ACTIVE_UNBOUNDED, revision: -1 },
    ];

    for (const row of invalidRows) {
      const port = new FakeEntitlementsReadAuthorityPortV1();
      port.result = Object.freeze([Object.freeze(row)]);
      await expect(getEntitlements({
        resolvedSubjectId: SUBJECT_ID,
        authorityPort: port,
        clock: new FixedEntitlementsReadClockV1(NOW),
      })).rejects.toThrow(/Entitlement authority/);
    }
  });

  it('fails closed on duplicate row identity or duplicate logical entitlement key', async () => {
    const duplicateIdPort = new FakeEntitlementsReadAuthorityPortV1();
    duplicateIdPort.result = Object.freeze([
      ACTIVE_UNBOUNDED,
      Object.freeze({
        ...ACTIVE_UNBOUNDED,
        entitlementKey: 'reading.other',
      }),
    ]);
    await expect(getEntitlements({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: duplicateIdPort,
      clock: new FixedEntitlementsReadClockV1(NOW),
    })).rejects.toThrow('duplicate entitlement identity');

    const duplicateLogicalPort = new FakeEntitlementsReadAuthorityPortV1();
    duplicateLogicalPort.result = Object.freeze([
      ACTIVE_UNBOUNDED,
      Object.freeze({
        ...ACTIVE_UNBOUNDED,
        entitlementId: '9a100000-0000-0000-0000-000000000099',
      }),
    ]);
    await expect(getEntitlements({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: duplicateLogicalPort,
      clock: new FixedEntitlementsReadClockV1(NOW),
    })).rejects.toThrow('duplicate logical entitlement key');
  });

  it('rejects an invalid internal wall clock before authority access and rethrows infrastructure failures', async () => {
    const invalidClockPort = new FakeEntitlementsReadAuthorityPortV1();
    await expect(getEntitlements({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: invalidClockPort,
      clock: new FixedEntitlementsReadClockV1(new Date('invalid')),
    })).rejects.toThrow('access clock returned an invalid timestamp');
    expect(invalidClockPort.calls).toHaveLength(0);

    const infraPort = new FakeEntitlementsReadAuthorityPortV1();
    const failure = new Error('database transport unavailable');
    infraPort.result = failure;
    await expect(getEntitlements({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: infraPort,
      clock: new FixedEntitlementsReadClockV1(NOW),
    })).rejects.toBe(failure);
  });
});
