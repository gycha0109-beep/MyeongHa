import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  getMemoryGrants,
  MEMORY_GRANTS_READ_AUTHORITY_BINDING_V1,
  MemoryGrantsReadAuthorityPortErrorV1,
  type MemoryGrantCurrentAuthorityRowV1,
  type MemoryGrantsReadAuthorityPortV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = '94000000-0000-0000-0000-000000000001';
const MEMORY_ID = '94000000-0000-0000-0000-000000000101';
const GRANT_ALPHA_ID = '94000000-0000-0000-0000-000000000201';
const GRANT_RETIRED_ID = '94000000-0000-0000-0000-000000000202';

const GRANT_ALPHA: MemoryGrantCurrentAuthorityRowV1 = Object.freeze({
  grantId: GRANT_ALPHA_ID,
  characterId: 'memory-scope-alpha',
  grantReason: 'user_choice',
  grantedAt: '2026-08-20T10:00:00.000Z',
});

const GRANT_RETIRED: MemoryGrantCurrentAuthorityRowV1 = Object.freeze({
  grantId: GRANT_RETIRED_ID,
  characterId: 'memory-scope-retired',
  grantReason: 'user_choice',
  grantedAt: '2026-08-20T12:00:00.000Z',
});

class FakeMemoryGrantsReadAuthorityPortV1
  implements MemoryGrantsReadAuthorityPortV1 {
  readonly calls: Array<{ subjectId: string; memoryItemId: string }> = [];
  result: readonly MemoryGrantCurrentAuthorityRowV1[] | Error = Object.freeze([
    GRANT_ALPHA,
    GRANT_RETIRED,
  ]);

  readActiveGrants(input: {
    readonly subjectId: string;
    readonly memoryItemId: string;
  }): readonly MemoryGrantCurrentAuthorityRowV1[] {
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

describe('current Memory grant API authority boundary', () => {
  it('pins the read boundary to the verified current explicit Memory grant query', () => {
    expect(MEMORY_GRANTS_READ_AUTHORITY_BINDING_V1)
      .toBe('public.qry_memory_active_grants_v1');
  });

  it('passes only trusted resolved subject and route Memory identity to authority', async () => {
    const port = new FakeMemoryGrantsReadAuthorityPortV1();
    const result = await getMemoryGrants({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      authorityPort: port,
    });

    expect(port.calls).toEqual([{ subjectId: SUBJECT_ID, memoryItemId: MEMORY_ID }]);
    expect(result).toEqual({
      memoryItemId: MEMORY_ID,
      grants: [
        {
          grantId: GRANT_ALPHA_ID,
          characterId: 'memory-scope-alpha',
          grantReason: 'user_choice',
          grantedAt: '2026-08-20T10:00:00.000Z',
        },
        {
          grantId: GRANT_RETIRED_ID,
          characterId: 'memory-scope-retired',
          grantReason: 'user_choice',
          grantedAt: '2026-08-20T12:00:00.000Z',
        },
      ],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.grants)).toBe(true);
    expect(result.grants.every((grant) => Object.isFrozen(grant))).toBe(true);
  });

  it('keeps an active historical grant to a retired character visible without inventing runtime eligibility', async () => {
    const port = new FakeMemoryGrantsReadAuthorityPortV1();
    const result = await getMemoryGrants({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      authorityPort: port,
    });

    expect(result.grants[1]).toMatchObject({
      characterId: 'memory-scope-retired',
    });
    expect(result.grants[1]).not.toHaveProperty('characterActive');
    expect(result.grants[1]).not.toHaveProperty('runtimeEligible');
  });

  it('allows an empty current grant list for a private or zero-grant Memory', async () => {
    const port = new FakeMemoryGrantsReadAuthorityPortV1();
    port.result = Object.freeze([]);

    await expect(getMemoryGrants({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      authorityPort: port,
    })).resolves.toEqual({ memoryItemId: MEMORY_ID, grants: [] });
  });

  it('preserves stored grant reason without defining new grant creation policy', async () => {
    const port = new FakeMemoryGrantsReadAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({
        ...GRANT_ALPHA,
        grantReason: 'stored_future_grant_reason',
      }),
    ]);

    const result = await getMemoryGrants({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      authorityPort: port,
    });
    expect(result.grants[0]?.grantReason).toBe('stored_future_grant_reason');
  });

  it('drops revoked/history, owner, Memory content, and runtime eligibility extras', async () => {
    const port = new FakeMemoryGrantsReadAuthorityPortV1();
    port.result = Object.freeze([
      {
        ...GRANT_ALPHA,
        revokedAt: 'must-not-leak',
        subjectId: 'must-not-leak',
        memoryContentJsonb: { secret: 'must-not-leak' },
        memoryType: 'must-not-leak',
        characterRetiredAt: 'must-not-leak',
        runtimeEligible: true,
      } as MemoryGrantCurrentAuthorityRowV1,
    ]);

    const serialized = JSON.stringify(await getMemoryGrants({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      authorityPort: port,
    }));

    expect(serialized).not.toContain('revokedAt');
    expect(serialized).not.toContain('subjectId');
    expect(serialized).not.toContain('memoryContentJsonb');
    expect(serialized).not.toContain('memoryType');
    expect(serialized).not.toContain('characterRetiredAt');
    expect(serialized).not.toContain('runtimeEligible');
    expect(serialized).not.toContain('must-not-leak');
  });

  it('requires trusted subject and nonblank route Memory identity before DB authority', async () => {
    const missingSubjectPort = new FakeMemoryGrantsReadAuthorityPortV1();
    await expectApiCode(
      getMemoryGrants({ memoryItemId: MEMORY_ID, authorityPort: missingSubjectPort }),
      'AUTH_REQUIRED',
    );
    expect(missingSubjectPort.calls).toHaveLength(0);

    const blankMemoryPort = new FakeMemoryGrantsReadAuthorityPortV1();
    await expectApiCode(
      getMemoryGrants({
        resolvedSubjectId: SUBJECT_ID,
        memoryItemId: '   ',
        authorityPort: blankMemoryPort,
      }),
      'INVALID_REQUEST',
    );
    expect(blankMemoryPort.calls).toHaveLength(0);
  });

  it('maps ineligible subjects and unavailable revoked/cross-owner/unknown Memories to the same bounded NOT_FOUND', async () => {
    for (const code of ['SUBJECT_INELIGIBLE', 'MEMORY_UNAVAILABLE'] as const) {
      const port = new FakeMemoryGrantsReadAuthorityPortV1();
      port.result = new MemoryGrantsReadAuthorityPortErrorV1(
        code,
        'raw authority detail must stay hidden',
      );

      const error = await expectApiCode(
        getMemoryGrants({
          resolvedSubjectId: SUBJECT_ID,
          memoryItemId: MEMORY_ID,
          authorityPort: port,
        }),
        'NOT_FOUND',
      );
      expect(error.message).toBe('Memory grants are unavailable.');
      expect(error.message).not.toContain('raw authority detail');
    }
  });

  it('maps authority input rejection to INVALID_REQUEST and rethrows infrastructure failures', async () => {
    const invalidPort = new FakeMemoryGrantsReadAuthorityPortV1();
    invalidPort.result = new MemoryGrantsReadAuthorityPortErrorV1(
      'INVALID_INPUT',
      'memory item is required',
    );
    await expectApiCode(
      getMemoryGrants({
        resolvedSubjectId: SUBJECT_ID,
        memoryItemId: MEMORY_ID,
        authorityPort: invalidPort,
      }),
      'INVALID_REQUEST',
    );

    const infraPort = new FakeMemoryGrantsReadAuthorityPortV1();
    const failure = new Error('database transport unavailable');
    infraPort.result = failure;
    await expect(getMemoryGrants({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      authorityPort: infraPort,
    })).rejects.toBe(failure);
  });

  it('fails closed on duplicate grant identities and non-deterministic timestamp ordering', async () => {
    const port = new FakeMemoryGrantsReadAuthorityPortV1();
    port.result = Object.freeze([
      GRANT_ALPHA,
      Object.freeze({ ...GRANT_RETIRED, grantId: GRANT_ALPHA_ID }),
    ]);
    await expect(getMemoryGrants({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      authorityPort: port,
    })).rejects.toThrow('duplicate grant identity');

    port.result = Object.freeze([GRANT_RETIRED, GRANT_ALPHA]);
    await expect(getMemoryGrants({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      authorityPort: port,
    })).rejects.toThrow('non-deterministic grant order');
  });

  it('fails closed when equal timestamps violate character then grant id ascending authority order', async () => {
    const port = new FakeMemoryGrantsReadAuthorityPortV1();
    const sameTime = '2026-08-20T10:00:00.000Z';

    port.result = Object.freeze([
      Object.freeze({
        ...GRANT_ALPHA,
        characterId: 'memory-scope-zeta',
        grantedAt: sameTime,
      }),
      Object.freeze({
        ...GRANT_RETIRED,
        characterId: 'memory-scope-alpha',
        grantedAt: sameTime,
      }),
    ]);
    await expect(getMemoryGrants({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      authorityPort: port,
    })).rejects.toThrow('non-deterministic grant order');

    port.result = Object.freeze([
      Object.freeze({
        ...GRANT_ALPHA,
        grantId: '94000000-0000-0000-0000-000000000302',
        characterId: 'memory-scope-alpha',
        grantedAt: sameTime,
      }),
      Object.freeze({
        ...GRANT_RETIRED,
        grantId: '94000000-0000-0000-0000-000000000301',
        characterId: 'memory-scope-alpha',
        grantedAt: sameTime,
      }),
    ]);
    await expect(getMemoryGrants({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      authorityPort: port,
    })).rejects.toThrow('non-deterministic grant order');
  });

  it('does not invent character-level uniqueness beyond the authority rows', async () => {
    const port = new FakeMemoryGrantsReadAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({
        ...GRANT_ALPHA,
        grantId: '94000000-0000-0000-0000-000000000301',
        characterId: 'memory-scope-alpha',
        grantedAt: '2026-08-20T10:00:00.000Z',
      }),
      Object.freeze({
        ...GRANT_RETIRED,
        grantId: '94000000-0000-0000-0000-000000000302',
        characterId: 'memory-scope-alpha',
        grantedAt: '2026-08-20T10:00:00.000Z',
      }),
    ]);

    await expect(getMemoryGrants({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      authorityPort: port,
    })).resolves.toMatchObject({ grants: [{ characterId: 'memory-scope-alpha' }, { characterId: 'memory-scope-alpha' }] });
  });

  it('fails closed on malformed grant identity, character, reason, or timestamp', async () => {
    const port = new FakeMemoryGrantsReadAuthorityPortV1();

    port.result = Object.freeze([Object.freeze({ ...GRANT_ALPHA, grantId: '' })]);
    await expect(getMemoryGrants({ resolvedSubjectId: SUBJECT_ID, memoryItemId: MEMORY_ID, authorityPort: port }))
      .rejects.toThrow('invalid grant identity');

    port.result = Object.freeze([Object.freeze({ ...GRANT_ALPHA, characterId: '' })]);
    await expect(getMemoryGrants({ resolvedSubjectId: SUBJECT_ID, memoryItemId: MEMORY_ID, authorityPort: port }))
      .rejects.toThrow('invalid character identity');

    port.result = Object.freeze([Object.freeze({ ...GRANT_ALPHA, grantReason: '' })]);
    await expect(getMemoryGrants({ resolvedSubjectId: SUBJECT_ID, memoryItemId: MEMORY_ID, authorityPort: port }))
      .rejects.toThrow('invalid grant reason');

    port.result = Object.freeze([Object.freeze({ ...GRANT_ALPHA, grantedAt: 'not-a-time' })]);
    await expect(getMemoryGrants({ resolvedSubjectId: SUBJECT_ID, memoryItemId: MEMORY_ID, authorityPort: port }))
      .rejects.toThrow('invalid granted timestamp');
  });
});
