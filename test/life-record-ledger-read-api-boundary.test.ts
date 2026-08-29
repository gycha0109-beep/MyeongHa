import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  getLifeRecordLedger,
  LIFE_RECORD_LEDGER_READ_AUTHORITY_BINDING_V1,
  LifeRecordLedgerReadAuthorityPortErrorV1,
  type LifeRecordLedgerAuthorityRowV1,
  type LifeRecordLedgerReadAuthorityPortV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = '92000000-0000-0000-0000-000000000001';
const OLD_FACT_ID = '92000000-0000-0000-0000-000000000101';
const NEW_FACT_ID = '92000000-0000-0000-0000-000000000102';
const REVOKED_FACT_ID = '92000000-0000-0000-0000-000000000103';

const NEW_FACT: LifeRecordLedgerAuthorityRowV1 = Object.freeze({
  lifeFactId: NEW_FACT_ID,
  factType: 'employment_status',
  schemaVersion: 'life-fact-v1',
  valueJsonb: Object.freeze({ value: 'new-role' }),
  validFrom: '2026-08-01T00:00:00.000Z',
  validTo: null,
  sourceKind: 'profile_edit',
  sourceMessageId: null,
  sourceMergeActionId: null,
  supersedesFactId: OLD_FACT_ID,
  confirmedAt: '2026-08-20T10:00:00.000Z',
  revokedAt: null,
  createdAt: '2026-08-20T10:00:00.000Z',
});

const REVOKED_FACT: LifeRecordLedgerAuthorityRowV1 = Object.freeze({
  lifeFactId: REVOKED_FACT_ID,
  factType: 'residence',
  schemaVersion: 'life-fact-v1',
  valueJsonb: Object.freeze({ value: 'seoul' }),
  validFrom: null,
  validTo: null,
  sourceKind: 'user_explicit',
  sourceMessageId: '92000000-0000-0000-0000-000000000201',
  sourceMergeActionId: null,
  supersedesFactId: null,
  confirmedAt: '2026-08-15T10:00:00.000Z',
  revokedAt: '2026-08-22T10:00:00.000Z',
  createdAt: '2026-08-15T10:00:00.000Z',
});

const OLD_FACT: LifeRecordLedgerAuthorityRowV1 = Object.freeze({
  lifeFactId: OLD_FACT_ID,
  factType: 'employment_status',
  schemaVersion: 'life-fact-v1',
  valueJsonb: Object.freeze({ value: 'old-role' }),
  validFrom: '2025-01-01T00:00:00.000Z',
  validTo: '2026-07-31T23:59:59.000Z',
  sourceKind: 'user_explicit',
  sourceMessageId: null,
  sourceMergeActionId: null,
  supersedesFactId: null,
  confirmedAt: '2026-08-10T10:00:00.000Z',
  revokedAt: null,
  createdAt: '2026-08-10T10:00:00.000Z',
});

class FakeLifeRecordLedgerReadAuthorityPortV1
  implements LifeRecordLedgerReadAuthorityPortV1 {
  readonly calls: Array<{ subjectId: string }> = [];
  result: readonly LifeRecordLedgerAuthorityRowV1[] | Error = Object.freeze([
    NEW_FACT,
    REVOKED_FACT,
    OLD_FACT,
  ]);

  readLedger(input: { readonly subjectId: string }): readonly LifeRecordLedgerAuthorityRowV1[] {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
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

describe('Life Record ledger API authority boundary', () => {
  it('pins the read boundary to the verified owner Life Fact ledger query', () => {
    expect(LIFE_RECORD_LEDGER_READ_AUTHORITY_BINDING_V1)
      .toBe('public.qry_life_record_ledger_v1');
  });

  it('passes only trusted resolved subject identity to authority', async () => {
    const port = new FakeLifeRecordLedgerReadAuthorityPortV1();
    const result = await getLifeRecordLedger({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    });

    expect(port.calls).toEqual([{ subjectId: SUBJECT_ID }]);
    expect(result.facts.map((fact) => fact.lifeFactId)).toEqual([
      NEW_FACT_ID,
      REVOKED_FACT_ID,
      OLD_FACT_ID,
    ]);
  });

  it('preserves superseded and revoked Life Facts instead of reducing to current values', async () => {
    const port = new FakeLifeRecordLedgerReadAuthorityPortV1();
    const result = await getLifeRecordLedger({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    });

    expect(result.facts).toHaveLength(3);
    expect(result.facts[0]).toMatchObject({
      lifeFactId: NEW_FACT_ID,
      supersedesFactId: OLD_FACT_ID,
      revokedAt: null,
    });
    expect(result.facts[1]).toMatchObject({
      lifeFactId: REVOKED_FACT_ID,
      revokedAt: '2026-08-22T10:00:00.000Z',
    });
    expect(result.facts[2]).toMatchObject({ lifeFactId: OLD_FACT_ID });
  });

  it('preserves stored Life Fact provenance and validity fields', async () => {
    const port = new FakeLifeRecordLedgerReadAuthorityPortV1();
    const result = await getLifeRecordLedger({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    });

    expect(result.facts[1]).toEqual({
      lifeFactId: REVOKED_FACT_ID,
      factType: 'residence',
      schemaVersion: 'life-fact-v1',
      valueJsonb: { value: 'seoul' },
      validFrom: null,
      validTo: null,
      sourceKind: 'user_explicit',
      sourceMessageId: '92000000-0000-0000-0000-000000000201',
      sourceMergeActionId: null,
      supersedesFactId: null,
      confirmedAt: '2026-08-15T10:00:00.000Z',
      revokedAt: '2026-08-22T10:00:00.000Z',
      createdAt: '2026-08-15T10:00:00.000Z',
    });
  });

  it('does not invent a positive Life Fact type/value registry while SRC-25 remains open', async () => {
    const port = new FakeLifeRecordLedgerReadAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({
        ...NEW_FACT,
        factType: 'stored_future_type',
        schemaVersion: 'stored-schema-v77',
        valueJsonb: Object.freeze({ nested: ['opaque', 7], enabled: true }),
      }),
    ]);

    const result = await getLifeRecordLedger({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    });
    expect(result.facts[0]).toMatchObject({
      factType: 'stored_future_type',
      schemaVersion: 'stored-schema-v77',
      valueJsonb: { nested: ['opaque', 7], enabled: true },
    });
  });

  it('drops adapter extras and never crosses into Memory Proposal or Access Grant authority', async () => {
    const port = new FakeLifeRecordLedgerReadAuthorityPortV1();
    port.result = Object.freeze([
      {
        ...NEW_FACT,
        subjectId: 'must-not-leak',
        memoryProposalId: 'must-not-leak',
        granteeCharacterId: 'must-not-leak',
        grantId: 'must-not-leak',
      } as LifeRecordLedgerAuthorityRowV1,
    ]);

    const serialized = JSON.stringify(await getLifeRecordLedger({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    }));
    expect(serialized).not.toContain('subjectId');
    expect(serialized).not.toContain('memoryProposalId');
    expect(serialized).not.toContain('granteeCharacterId');
    expect(serialized).not.toContain('grantId');
    expect(serialized).not.toContain('must-not-leak');
  });

  it('allows an empty owner ledger', async () => {
    const port = new FakeLifeRecordLedgerReadAuthorityPortV1();
    port.result = Object.freeze([]);

    await expect(getLifeRecordLedger({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    })).resolves.toEqual({ facts: [] });
  });

  it('requires trusted resolved subject identity before DB authority', async () => {
    const missingPort = new FakeLifeRecordLedgerReadAuthorityPortV1();
    await expectApiCode(
      getLifeRecordLedger({ authorityPort: missingPort }),
      'AUTH_REQUIRED',
    );
    expect(missingPort.calls).toHaveLength(0);

    const blankPort = new FakeLifeRecordLedgerReadAuthorityPortV1();
    await expectApiCode(
      getLifeRecordLedger({ resolvedSubjectId: '   ', authorityPort: blankPort }),
      'AUTH_REQUIRED',
    );
    expect(blankPort.calls).toHaveLength(0);
  });

  it('maps ineligible merged/deletion-pending/deleted subject reads to bounded NOT_FOUND', async () => {
    const port = new FakeLifeRecordLedgerReadAuthorityPortV1();
    port.result = new LifeRecordLedgerReadAuthorityPortErrorV1(
      'SUBJECT_INELIGIBLE',
      'raw subject state must stay hidden',
    );

    const error = await expectApiCode(
      getLifeRecordLedger({ resolvedSubjectId: SUBJECT_ID, authorityPort: port }),
      'NOT_FOUND',
    );
    expect(error.message).toBe('Life Record is unavailable for the current subject.');
  });

  it('maps authority input rejection to INVALID_REQUEST and rethrows infrastructure failures', async () => {
    const invalidPort = new FakeLifeRecordLedgerReadAuthorityPortV1();
    invalidPort.result = new LifeRecordLedgerReadAuthorityPortErrorV1(
      'INVALID_INPUT',
      'life record subject is required',
    );
    await expectApiCode(
      getLifeRecordLedger({ resolvedSubjectId: SUBJECT_ID, authorityPort: invalidPort }),
      'INVALID_REQUEST',
    );

    const infraPort = new FakeLifeRecordLedgerReadAuthorityPortV1();
    const failure = new Error('database transport unavailable');
    infraPort.result = failure;
    await expect(getLifeRecordLedger({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: infraPort,
    })).rejects.toBe(failure);
  });

  it('fails closed on duplicate identities and non-deterministic ledger ordering', async () => {
    const port = new FakeLifeRecordLedgerReadAuthorityPortV1();
    port.result = Object.freeze([
      NEW_FACT,
      Object.freeze({ ...REVOKED_FACT, lifeFactId: NEW_FACT_ID }),
    ]);
    await expect(getLifeRecordLedger({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    })).rejects.toThrow('duplicate Life Fact identity');

    port.result = Object.freeze([OLD_FACT, NEW_FACT]);
    await expect(getLifeRecordLedger({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    })).rejects.toThrow('non-deterministic ledger order');
  });

  it('fails closed on malformed provenance, timestamps, values, and validity intervals', async () => {
    const port = new FakeLifeRecordLedgerReadAuthorityPortV1();

    port.result = Object.freeze([
      Object.freeze({ ...NEW_FACT, sourceKind: '' }),
    ]);
    await expect(getLifeRecordLedger({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    })).rejects.toThrow('invalid source kind');

    port.result = Object.freeze([
      Object.freeze({ ...NEW_FACT, confirmedAt: 'not-a-time' }),
    ]);
    await expect(getLifeRecordLedger({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    })).rejects.toThrow('invalid confirmed timestamp');

    port.result = Object.freeze([
      Object.freeze({ ...NEW_FACT, valueJsonb: undefined }),
    ]);
    await expect(getLifeRecordLedger({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    })).rejects.toThrow('undefined Life Fact value');

    port.result = Object.freeze([
      Object.freeze({
        ...NEW_FACT,
        validFrom: '2026-09-02T00:00:00.000Z',
        validTo: '2026-09-01T00:00:00.000Z',
      }),
    ]);
    await expect(getLifeRecordLedger({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    })).rejects.toThrow('invalid validity interval');
  });

  it('fails closed on self-supersession while preserving external lineage ids', async () => {
    const port = new FakeLifeRecordLedgerReadAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({ ...NEW_FACT, supersedesFactId: NEW_FACT_ID }),
    ]);

    await expect(getLifeRecordLedger({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    })).rejects.toThrow('self-superseding Life Fact');
  });
});
