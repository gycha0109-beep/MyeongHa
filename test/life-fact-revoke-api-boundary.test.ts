import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  LIFE_FACT_REVOKE_COMMAND_AUTHORITY_BINDING_V1,
  LifeFactRevokeCommandAuthorityPortErrorV1,
  revokeLifeFact,
  type LifeFactRevokeCommandAuthorityPortV1,
  type LifeFactRevokeCommandAuthorityRowV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = '97000000-0000-0000-0000-000000000001';
const LIFE_FACT_ID = '97000000-0000-0000-0000-000000000101';
const REVOKED_AT = '2026-08-30T02:34:56.000Z';

const SUCCESS_ROW: LifeFactRevokeCommandAuthorityRowV1 = Object.freeze({
  lifeFactId: LIFE_FACT_ID,
  revokedAt: REVOKED_AT,
  replayed: false,
});

class FakeLifeFactRevokeCommandAuthorityPortV1
  implements LifeFactRevokeCommandAuthorityPortV1 {
  readonly calls: Array<{ subjectId: string; lifeFactId: string }> = [];
  result: readonly LifeFactRevokeCommandAuthorityRowV1[] | Error = Object.freeze([
    SUCCESS_ROW,
  ]);

  revokeLifeFact(input: {
    readonly subjectId: string;
    readonly lifeFactId: string;
  }): readonly LifeFactRevokeCommandAuthorityRowV1[] {
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

describe('Life Fact revoke API authority boundary', () => {
  it('pins DELETE /api/life-record/:id to the verified Life Fact revoke command', () => {
    expect(LIFE_FACT_REVOKE_COMMAND_AUTHORITY_BINDING_V1)
      .toBe('public.cmd_revoke_life_fact_v1');
  });

  it('passes only trusted resolved subject and route Life Fact identity to authority', async () => {
    const port = new FakeLifeFactRevokeCommandAuthorityPortV1();
    const result = await revokeLifeFact({
      resolvedSubjectId: SUBJECT_ID,
      lifeFactId: LIFE_FACT_ID,
      authorityPort: port,
    });

    expect(port.calls).toEqual([{ subjectId: SUBJECT_ID, lifeFactId: LIFE_FACT_ID }]);
    expect(result).toEqual({
      lifeFactId: LIFE_FACT_ID,
      revokedAt: REVOKED_AT,
      replayed: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('preserves authoritative replay of the original revocation timestamp', async () => {
    const port = new FakeLifeFactRevokeCommandAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({ ...SUCCESS_ROW, replayed: true }),
    ]);

    await expect(revokeLifeFact({
      resolvedSubjectId: SUBJECT_ID,
      lifeFactId: LIFE_FACT_ID,
      authorityPort: port,
    })).resolves.toEqual({
      lifeFactId: LIFE_FACT_ID,
      revokedAt: REVOKED_AT,
      replayed: true,
    });
  });

  it('does not pretend revoke hard-deletes structured history, provenance, grants, or supersession lineage', async () => {
    const port = new FakeLifeFactRevokeCommandAuthorityPortV1();
    port.result = Object.freeze([
      {
        ...SUCCESS_ROW,
        hardDeleted: true,
        factType: 'must-not-leak',
        schemaVersion: 'must-not-leak',
        valueJsonb: { secret: 'must-not-leak' },
        sourceKind: 'must-not-leak',
        supersedesFactId: 'must-not-leak',
        grantsRevoked: true,
      } as LifeFactRevokeCommandAuthorityRowV1,
    ]);

    const serialized = JSON.stringify(await revokeLifeFact({
      resolvedSubjectId: SUBJECT_ID,
      lifeFactId: LIFE_FACT_ID,
      authorityPort: port,
    }));

    expect(serialized).not.toContain('hardDeleted');
    expect(serialized).not.toContain('factType');
    expect(serialized).not.toContain('schemaVersion');
    expect(serialized).not.toContain('valueJsonb');
    expect(serialized).not.toContain('sourceKind');
    expect(serialized).not.toContain('supersedesFactId');
    expect(serialized).not.toContain('grantsRevoked');
    expect(serialized).not.toContain('must-not-leak');
  });

  it('requires trusted subject and a nonblank route Life Fact identity before DB authority', async () => {
    const missingSubjectPort = new FakeLifeFactRevokeCommandAuthorityPortV1();
    await expectApiCode(
      revokeLifeFact({ lifeFactId: LIFE_FACT_ID, authorityPort: missingSubjectPort }),
      'AUTH_REQUIRED',
    );
    expect(missingSubjectPort.calls).toHaveLength(0);

    const invalidLifeFactPort = new FakeLifeFactRevokeCommandAuthorityPortV1();
    await expectApiCode(
      revokeLifeFact({
        resolvedSubjectId: SUBJECT_ID,
        lifeFactId: '   ',
        authorityPort: invalidLifeFactPort,
      }),
      'INVALID_REQUEST',
    );
    expect(invalidLifeFactPort.calls).toHaveLength(0);
  });

  it('maps ineligible subject and cross-owner/unknown Life Fact probes to the same bounded NOT_FOUND', async () => {
    for (const code of ['SUBJECT_INELIGIBLE', 'LIFE_FACT_UNAVAILABLE'] as const) {
      const port = new FakeLifeFactRevokeCommandAuthorityPortV1();
      port.result = new LifeFactRevokeCommandAuthorityPortErrorV1(
        code,
        'raw authority detail must stay hidden',
      );

      const error = await expectApiCode(
        revokeLifeFact({
          resolvedSubjectId: SUBJECT_ID,
          lifeFactId: LIFE_FACT_ID,
          authorityPort: port,
        }),
        'NOT_FOUND',
      );
      expect(error.message).toBe('Life Fact is unavailable for the current subject.');
      expect(error.message).not.toContain('raw authority detail');
    }
  });

  it('maps authority input rejection to INVALID_REQUEST and rethrows infrastructure failures', async () => {
    const invalidPort = new FakeLifeFactRevokeCommandAuthorityPortV1();
    invalidPort.result = new LifeFactRevokeCommandAuthorityPortErrorV1(
      'INVALID_INPUT',
      'life fact id is required',
    );
    await expectApiCode(
      revokeLifeFact({
        resolvedSubjectId: SUBJECT_ID,
        lifeFactId: LIFE_FACT_ID,
        authorityPort: invalidPort,
      }),
      'INVALID_REQUEST',
    );

    const infraPort = new FakeLifeFactRevokeCommandAuthorityPortV1();
    const failure = new Error('database transport unavailable');
    infraPort.result = failure;
    await expect(revokeLifeFact({
      resolvedSubjectId: SUBJECT_ID,
      lifeFactId: LIFE_FACT_ID,
      authorityPort: infraPort,
    })).rejects.toBe(failure);
  });

  it('fails closed unless authority returns exactly one successful row', async () => {
    const port = new FakeLifeFactRevokeCommandAuthorityPortV1();
    port.result = Object.freeze([]);
    await expect(revokeLifeFact({
      resolvedSubjectId: SUBJECT_ID,
      lifeFactId: LIFE_FACT_ID,
      authorityPort: port,
    })).rejects.toThrow('exactly one successful row');

    port.result = Object.freeze([SUCCESS_ROW, SUCCESS_ROW]);
    await expect(revokeLifeFact({
      resolvedSubjectId: SUBJECT_ID,
      lifeFactId: LIFE_FACT_ID,
      authorityPort: port,
    })).rejects.toThrow('exactly one successful row');
  });

  it('fails closed on mismatched Life Fact identity, invalid timestamp, or invalid replay marker', async () => {
    const port = new FakeLifeFactRevokeCommandAuthorityPortV1();

    port.result = Object.freeze([
      Object.freeze({
        ...SUCCESS_ROW,
        lifeFactId: '97000000-0000-0000-0000-000000000999',
      }),
    ]);
    await expect(revokeLifeFact({
      resolvedSubjectId: SUBJECT_ID,
      lifeFactId: LIFE_FACT_ID,
      authorityPort: port,
    })).rejects.toThrow('different Life Fact identity');

    port.result = Object.freeze([
      Object.freeze({ ...SUCCESS_ROW, revokedAt: 'not-a-time' }),
    ]);
    await expect(revokeLifeFact({
      resolvedSubjectId: SUBJECT_ID,
      lifeFactId: LIFE_FACT_ID,
      authorityPort: port,
    })).rejects.toThrow('invalid revokedAt timestamp');

    port.result = Object.freeze([
      { ...SUCCESS_ROW, replayed: 'yes' } as unknown as LifeFactRevokeCommandAuthorityRowV1,
    ]);
    await expect(revokeLifeFact({
      resolvedSubjectId: SUBJECT_ID,
      lifeFactId: LIFE_FACT_ID,
      authorityPort: port,
    })).rejects.toThrow('invalid replay marker');
  });
});
