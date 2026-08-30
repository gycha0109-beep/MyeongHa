import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  MEMORY_GRANT_REVOKE_COMMAND_AUTHORITY_BINDING_V1,
  MemoryGrantRevokeCommandAuthorityPortErrorV1,
  revokeMemoryCharacterGrant,
  type MemoryGrantRevokeCommandAuthorityPortV1,
  type MemoryGrantRevokeCommandAuthorityRowV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = '96000000-0000-0000-0000-000000000001';
const MEMORY_ID = '96000000-0000-0000-0000-000000000101';
const CHARACTER_ID = 'memory-scope-alpha';

const SUCCESS_ROW: MemoryGrantRevokeCommandAuthorityRowV1 = Object.freeze({
  memoryItemId: MEMORY_ID,
  characterId: CHARACTER_ID,
  revokedGrantCount: 1,
  replayed: false,
});

class FakeMemoryGrantRevokeCommandAuthorityPortV1
  implements MemoryGrantRevokeCommandAuthorityPortV1 {
  readonly calls: Array<{
    subjectId: string;
    memoryItemId: string;
    characterId: string;
  }> = [];
  result: readonly MemoryGrantRevokeCommandAuthorityRowV1[] | Error = Object.freeze([
    SUCCESS_ROW,
  ]);

  revokeCharacterGrants(input: {
    readonly subjectId: string;
    readonly memoryItemId: string;
    readonly characterId: string;
  }): readonly MemoryGrantRevokeCommandAuthorityRowV1[] {
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

describe('Memory character grant revoke API authority boundary', () => {
  it('pins the route to the verified individual Memory grant revoke command', () => {
    expect(MEMORY_GRANT_REVOKE_COMMAND_AUTHORITY_BINDING_V1)
      .toBe('public.cmd_revoke_memory_character_grant_v1');
  });

  it('passes only trusted subject and route Memory/character identities to authority', async () => {
    const port = new FakeMemoryGrantRevokeCommandAuthorityPortV1();
    const result = await revokeMemoryCharacterGrant({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      characterId: CHARACTER_ID,
      authorityPort: port,
    });

    expect(port.calls).toEqual([{
      subjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      characterId: CHARACTER_ID,
    }]);
    expect(result).toEqual({
      memoryItemId: MEMORY_ID,
      characterId: CHARACTER_ID,
      revokedGrantCount: 1,
      replayed: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('preserves state-derived no-op replay when no active grant remains', async () => {
    const port = new FakeMemoryGrantRevokeCommandAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({ ...SUCCESS_ROW, revokedGrantCount: 0, replayed: true }),
    ]);

    await expect(revokeMemoryCharacterGrant({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      characterId: CHARACTER_ID,
      authorityPort: port,
    })).resolves.toEqual({
      memoryItemId: MEMORY_ID,
      characterId: CHARACTER_ID,
      revokedGrantCount: 0,
      replayed: true,
    });
  });

  it('does not add current-Memory or active-character eligibility ahead of DB authority', async () => {
    const port = new FakeMemoryGrantRevokeCommandAuthorityPortV1();
    const retiredCharacterId = 'retired-character-with-historical-grant';
    port.result = Object.freeze([
      Object.freeze({ ...SUCCESS_ROW, characterId: retiredCharacterId }),
    ]);

    const result = await revokeMemoryCharacterGrant({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      characterId: retiredCharacterId,
      authorityPort: port,
    });

    expect(port.calls[0]).toEqual({
      subjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      characterId: retiredCharacterId,
    });
    expect(result).toMatchObject({
      characterId: retiredCharacterId,
      revokedGrantCount: 1,
      replayed: false,
    });
  });

  it('drops accidental extras instead of implying Memory deletion or unrelated grant mutation', async () => {
    const port = new FakeMemoryGrantRevokeCommandAuthorityPortV1();
    port.result = Object.freeze([
      {
        ...SUCCESS_ROW,
        memoryDeleted: true,
        memoryRevokedAt: 'must-not-leak',
        allCharacterGrantsRevoked: true,
        revokedGrantIds: ['must-not-leak'],
        characterRetiredAt: 'must-not-leak',
      } as MemoryGrantRevokeCommandAuthorityRowV1,
    ]);

    const serialized = JSON.stringify(await revokeMemoryCharacterGrant({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      characterId: CHARACTER_ID,
      authorityPort: port,
    }));

    expect(serialized).not.toContain('memoryDeleted');
    expect(serialized).not.toContain('memoryRevokedAt');
    expect(serialized).not.toContain('allCharacterGrantsRevoked');
    expect(serialized).not.toContain('revokedGrantIds');
    expect(serialized).not.toContain('characterRetiredAt');
    expect(serialized).not.toContain('must-not-leak');
  });

  it('requires trusted subject and both nonblank route identities before DB authority', async () => {
    const missingSubjectPort = new FakeMemoryGrantRevokeCommandAuthorityPortV1();
    await expectApiCode(
      revokeMemoryCharacterGrant({
        memoryItemId: MEMORY_ID,
        characterId: CHARACTER_ID,
        authorityPort: missingSubjectPort,
      }),
      'AUTH_REQUIRED',
    );
    expect(missingSubjectPort.calls).toHaveLength(0);

    const blankMemoryPort = new FakeMemoryGrantRevokeCommandAuthorityPortV1();
    await expectApiCode(
      revokeMemoryCharacterGrant({
        resolvedSubjectId: SUBJECT_ID,
        memoryItemId: '   ',
        characterId: CHARACTER_ID,
        authorityPort: blankMemoryPort,
      }),
      'INVALID_REQUEST',
    );
    expect(blankMemoryPort.calls).toHaveLength(0);

    const blankCharacterPort = new FakeMemoryGrantRevokeCommandAuthorityPortV1();
    await expectApiCode(
      revokeMemoryCharacterGrant({
        resolvedSubjectId: SUBJECT_ID,
        memoryItemId: MEMORY_ID,
        characterId: '',
        authorityPort: blankCharacterPort,
      }),
      'INVALID_REQUEST',
    );
    expect(blankCharacterPort.calls).toHaveLength(0);
  });

  it('collapses subject, Memory, and character availability probes into bounded NOT_FOUND', async () => {
    for (const code of [
      'SUBJECT_INELIGIBLE',
      'MEMORY_UNAVAILABLE',
      'CHARACTER_UNAVAILABLE',
    ] as const) {
      const port = new FakeMemoryGrantRevokeCommandAuthorityPortV1();
      port.result = new MemoryGrantRevokeCommandAuthorityPortErrorV1(
        code,
        'raw authority detail must stay hidden',
      );

      const error = await expectApiCode(
        revokeMemoryCharacterGrant({
          resolvedSubjectId: SUBJECT_ID,
          memoryItemId: MEMORY_ID,
          characterId: CHARACTER_ID,
          authorityPort: port,
        }),
        'NOT_FOUND',
      );
      expect(error.message).toBe('Memory grant is unavailable.');
      expect(error.message).not.toContain('raw authority detail');
    }
  });

  it('maps authority input rejection and rethrows infrastructure failures', async () => {
    const invalidPort = new FakeMemoryGrantRevokeCommandAuthorityPortV1();
    invalidPort.result = new MemoryGrantRevokeCommandAuthorityPortErrorV1(
      'INVALID_INPUT',
      'character id is required',
    );
    await expectApiCode(
      revokeMemoryCharacterGrant({
        resolvedSubjectId: SUBJECT_ID,
        memoryItemId: MEMORY_ID,
        characterId: CHARACTER_ID,
        authorityPort: invalidPort,
      }),
      'INVALID_REQUEST',
    );

    const infraPort = new FakeMemoryGrantRevokeCommandAuthorityPortV1();
    const failure = new Error('database transport unavailable');
    infraPort.result = failure;
    await expect(revokeMemoryCharacterGrant({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      characterId: CHARACTER_ID,
      authorityPort: infraPort,
    })).rejects.toBe(failure);
  });

  it('fails closed unless authority returns exactly one successful row', async () => {
    const port = new FakeMemoryGrantRevokeCommandAuthorityPortV1();
    port.result = Object.freeze([]);
    await expect(revokeMemoryCharacterGrant({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      characterId: CHARACTER_ID,
      authorityPort: port,
    })).rejects.toThrow('exactly one successful row');

    port.result = Object.freeze([SUCCESS_ROW, SUCCESS_ROW]);
    await expect(revokeMemoryCharacterGrant({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      characterId: CHARACTER_ID,
      authorityPort: port,
    })).rejects.toThrow('exactly one successful row');
  });

  it('fails closed on identity mismatch, invalid count/replay type, or inconsistent replay state', async () => {
    const port = new FakeMemoryGrantRevokeCommandAuthorityPortV1();

    port.result = Object.freeze([
      Object.freeze({ ...SUCCESS_ROW, memoryItemId: '96000000-0000-0000-0000-000000000999' }),
    ]);
    await expect(revokeMemoryCharacterGrant({ resolvedSubjectId: SUBJECT_ID, memoryItemId: MEMORY_ID, characterId: CHARACTER_ID, authorityPort: port }))
      .rejects.toThrow('different Memory identity');

    port.result = Object.freeze([
      Object.freeze({ ...SUCCESS_ROW, characterId: 'different-character' }),
    ]);
    await expect(revokeMemoryCharacterGrant({ resolvedSubjectId: SUBJECT_ID, memoryItemId: MEMORY_ID, characterId: CHARACTER_ID, authorityPort: port }))
      .rejects.toThrow('different character identity');

    port.result = Object.freeze([
      Object.freeze({ ...SUCCESS_ROW, revokedGrantCount: -1 }),
    ]);
    await expect(revokeMemoryCharacterGrant({ resolvedSubjectId: SUBJECT_ID, memoryItemId: MEMORY_ID, characterId: CHARACTER_ID, authorityPort: port }))
      .rejects.toThrow('invalid revoked grant count');

    port.result = Object.freeze([
      { ...SUCCESS_ROW, replayed: 'yes' } as unknown as MemoryGrantRevokeCommandAuthorityRowV1,
    ]);
    await expect(revokeMemoryCharacterGrant({ resolvedSubjectId: SUBJECT_ID, memoryItemId: MEMORY_ID, characterId: CHARACTER_ID, authorityPort: port }))
      .rejects.toThrow('invalid replay marker');

    port.result = Object.freeze([
      Object.freeze({ ...SUCCESS_ROW, revokedGrantCount: 0, replayed: false }),
    ]);
    await expect(revokeMemoryCharacterGrant({ resolvedSubjectId: SUBJECT_ID, memoryItemId: MEMORY_ID, characterId: CHARACTER_ID, authorityPort: port }))
      .rejects.toThrow('inconsistent replay state');
  });

  it('accepts multiple active matching grants being revoked without inventing character uniqueness', async () => {
    const port = new FakeMemoryGrantRevokeCommandAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({ ...SUCCESS_ROW, revokedGrantCount: 3 }),
    ]);

    await expect(revokeMemoryCharacterGrant({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      characterId: CHARACTER_ID,
      authorityPort: port,
    })).resolves.toMatchObject({ revokedGrantCount: 3, replayed: false });
  });
});
