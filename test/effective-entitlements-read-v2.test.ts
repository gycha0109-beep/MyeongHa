import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/api-error.js';
import {
  EFFECTIVE_ENTITLEMENTS_READ_AUTHORITY_BINDING_V2,
  EffectiveEntitlementsReadAuthorityPortErrorV2,
  getEffectiveEntitlements,
  type EffectiveEntitlementAuthorityRowV2,
  type EffectiveEntitlementsReadAuthorityPortV2,
  type EffectiveEntitlementsReadClockV2,
} from '../apps/api/src/effective-entitlements-read-v2.js';

const SUBJECT_ID = 'e7000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-09-01T00:00:00.000Z');

const EFFECTIVE_UNBOUNDED: EffectiveEntitlementAuthorityRowV2 = Object.freeze({
  entitlementKey: 'reading.general',
  scopeKey: null,
  effectiveValidUntil: null,
});

const EFFECTIVE_BOUNDED: EffectiveEntitlementAuthorityRowV2 = Object.freeze({
  entitlementKey: 'episode.special',
  scopeKey: 'episode-42',
  effectiveValidUntil: '2026-12-01T00:00:00.000Z',
});

class FakeEffectiveEntitlementsReadAuthorityPortV2
implements EffectiveEntitlementsReadAuthorityPortV2 {
  readonly calls: Array<{ subjectId: string; effectiveAt: string }> = [];
  result: readonly EffectiveEntitlementAuthorityRowV2[] | Error = Object.freeze([
    EFFECTIVE_BOUNDED,
    EFFECTIVE_UNBOUNDED,
  ]);

  readEffectiveEntitlements(input: {
    readonly subjectId: string;
    readonly effectiveAt: string;
  }): readonly EffectiveEntitlementAuthorityRowV2[] {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class FixedClock implements EffectiveEntitlementsReadClockV2 {
  constructor(private readonly value: Date) {}
  now(): Date { return this.value; }
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

describe('Guest-aware effective entitlement read v2 boundary', () => {
  it('pins the adapter to qry_effective_entitlements_v2', () => {
    expect(EFFECTIVE_ENTITLEMENTS_READ_AUTHORITY_BINDING_V2)
      .toBe('public.qry_effective_entitlements_v2');
  });

  it('passes only trusted subject identity and server evaluation time to DB authority', async () => {
    const port = new FakeEffectiveEntitlementsReadAuthorityPortV2();
    const result = await getEffectiveEntitlements({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
      clock: new FixedClock(NOW),
    });

    expect(port.calls).toEqual([{
      subjectId: SUBJECT_ID,
      effectiveAt: NOW.toISOString(),
    }]);
    expect(result).toEqual({
      entitlements: [EFFECTIVE_BOUNDED, EFFECTIVE_UNBOUNDED],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.entitlements)).toBe(true);
    expect(Object.isFrozen(result.entitlements[0])).toBe(true);
  });

  it('emits only effective-access fields and never fabricates aggregate projection authority', async () => {
    const port = new FakeEffectiveEntitlementsReadAuthorityPortV2();
    port.result = Object.freeze([
      {
        ...EFFECTIVE_UNBOUNDED,
        entitlementId: 'invented-id',
        revision: 99,
        activeGrantCount: 7,
        sourceSubjectId: 'invented-source',
        grantIds: ['invented-grant'],
        receiptId: 'invented-receipt',
      } as EffectiveEntitlementAuthorityRowV2,
    ]);

    const serialized = JSON.stringify(await getEffectiveEntitlements({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
      clock: new FixedClock(NOW),
    }));

    for (const forbidden of [
      'entitlementId',
      'revision',
      'activeGrantCount',
      'sourceSubjectId',
      'grantIds',
      'receiptId',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('requires a trusted resolved subject before invoking DB authority', async () => {
    const port = new FakeEffectiveEntitlementsReadAuthorityPortV2();
    await expectApiCode(
      getEffectiveEntitlements({ authorityPort: port, clock: new FixedClock(NOW) }),
      'AUTH_REQUIRED',
    );
    expect(port.calls).toHaveLength(0);
  });

  it('maps subject eligibility probes to bounded NOT_FOUND and input rejection to INVALID_REQUEST', async () => {
    const ineligible = new FakeEffectiveEntitlementsReadAuthorityPortV2();
    ineligible.result = new EffectiveEntitlementsReadAuthorityPortErrorV2(
      'SUBJECT_INELIGIBLE',
      'raw lineage detail must stay hidden',
    );

    const notFound = await expectApiCode(
      getEffectiveEntitlements({
        resolvedSubjectId: SUBJECT_ID,
        authorityPort: ineligible,
        clock: new FixedClock(NOW),
      }),
      'NOT_FOUND',
    );
    expect(notFound.message)
      .toBe('Effective entitlements are unavailable for the current subject.');
    expect(notFound.message).not.toContain('raw lineage detail');

    const invalid = new FakeEffectiveEntitlementsReadAuthorityPortV2();
    invalid.result = new EffectiveEntitlementsReadAuthorityPortErrorV2(
      'INVALID_INPUT',
      'effective entitlement evaluation timestamp is required',
    );
    await expectApiCode(
      getEffectiveEntitlements({
        resolvedSubjectId: SUBJECT_ID,
        authorityPort: invalid,
        clock: new FixedClock(NOW),
      }),
      'INVALID_REQUEST',
    );
  });

  it('fails closed on malformed or already-expired authority rows', async () => {
    const invalidRows: EffectiveEntitlementAuthorityRowV2[] = [
      { ...EFFECTIVE_UNBOUNDED, entitlementKey: '' },
      { ...EFFECTIVE_UNBOUNDED, scopeKey: '__GLOBAL__' },
      { ...EFFECTIVE_UNBOUNDED, effectiveValidUntil: 'not-a-timestamp' },
      { ...EFFECTIVE_UNBOUNDED, effectiveValidUntil: NOW.toISOString() },
      { ...EFFECTIVE_UNBOUNDED, effectiveValidUntil: '2026-08-31T23:59:59.999Z' },
    ];

    for (const row of invalidRows) {
      const port = new FakeEffectiveEntitlementsReadAuthorityPortV2();
      port.result = Object.freeze([Object.freeze(row)]);
      await expect(getEffectiveEntitlements({
        resolvedSubjectId: SUBJECT_ID,
        authorityPort: port,
        clock: new FixedClock(NOW),
      })).rejects.toThrow(/Effective entitlement authority/);
    }
  });

  it('fails closed if DB authority returns duplicate logical keys', async () => {
    const port = new FakeEffectiveEntitlementsReadAuthorityPortV2();
    port.result = Object.freeze([
      EFFECTIVE_UNBOUNDED,
      Object.freeze({ ...EFFECTIVE_UNBOUNDED }),
    ]);

    await expect(getEffectiveEntitlements({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
      clock: new FixedClock(NOW),
    })).rejects.toThrow('duplicate logical entitlement key');
  });

  it('rejects an invalid internal clock before authority access and rethrows infrastructure failures', async () => {
    const invalidClockPort = new FakeEffectiveEntitlementsReadAuthorityPortV2();
    await expect(getEffectiveEntitlements({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: invalidClockPort,
      clock: new FixedClock(new Date('invalid')),
    })).rejects.toThrow('access clock returned an invalid timestamp');
    expect(invalidClockPort.calls).toHaveLength(0);

    const infraPort = new FakeEffectiveEntitlementsReadAuthorityPortV2();
    const failure = new Error('database transport unavailable');
    infraPort.result = failure;
    await expect(getEffectiveEntitlements({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: infraPort,
      clock: new FixedClock(NOW),
    })).rejects.toBe(failure);
  });
});
