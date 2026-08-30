import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  CHARACTER_FORGET_COMMAND_AUTHORITY_BINDING_V1,
  CharacterForgetCommandAuthorityPortErrorV1,
  forgetCharacter,
  type CharacterForgetCommandAuthorityPortV1,
  type CharacterForgetCommandAuthorityRowV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = '98000000-0000-0000-0000-000000000001';
const CHARACTER_ID = 'forget-alpha';

const SUCCESS_ROW: CharacterForgetCommandAuthorityRowV1 = Object.freeze({
  characterId: CHARACTER_ID,
  revokedGrantCount: 2,
  replayed: false,
});

class FakeCharacterForgetCommandAuthorityPortV1
  implements CharacterForgetCommandAuthorityPortV1 {
  readonly calls: Array<{ subjectId: string; characterId: string }> = [];
  result: readonly CharacterForgetCommandAuthorityRowV1[] | Error = Object.freeze([
    SUCCESS_ROW,
  ]);

  forgetCharacterRecords(input: {
    readonly subjectId: string;
    readonly characterId: string;
  }): readonly CharacterForgetCommandAuthorityRowV1[] {
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

describe('Character forget API authority boundary', () => {
  it('pins POST /api/characters/:id/forget to the verified character forget command', () => {
    expect(CHARACTER_FORGET_COMMAND_AUTHORITY_BINDING_V1)
      .toBe('public.cmd_forget_character_records_v1');
  });

  it('passes only trusted resolved subject and route character identity to authority', async () => {
    const port = new FakeCharacterForgetCommandAuthorityPortV1();
    const result = await forgetCharacter({
      resolvedSubjectId: SUBJECT_ID,
      characterId: CHARACTER_ID,
      authorityPort: port,
    });

    expect(port.calls).toEqual([{ subjectId: SUBJECT_ID, characterId: CHARACTER_ID }]);
    expect(result).toEqual({
      characterId: CHARACTER_ID,
      revokedGrantCount: 2,
      replayed: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('preserves state-derived no-op replay when this character has no active grants', async () => {
    const port = new FakeCharacterForgetCommandAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({
        characterId: CHARACTER_ID,
        revokedGrantCount: 0,
        replayed: true,
      }),
    ]);

    await expect(forgetCharacter({
      resolvedSubjectId: SUBJECT_ID,
      characterId: CHARACTER_ID,
      authorityPort: port,
    })).resolves.toEqual({
      characterId: CHARACTER_ID,
      revokedGrantCount: 0,
      replayed: true,
    });
  });

  it('keeps retired characters forgettable so historical active grants can be revoked', async () => {
    const port = new FakeCharacterForgetCommandAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({
        characterId: 'forget-retired',
        revokedGrantCount: 1,
        replayed: false,
      }),
    ]);

    await expect(forgetCharacter({
      resolvedSubjectId: SUBJECT_ID,
      characterId: 'forget-retired',
      authorityPort: port,
    })).resolves.toEqual({
      characterId: 'forget-retired',
      revokedGrantCount: 1,
      replayed: false,
    });
  });

  it('does not pretend forget deletes records, the character, relationship state, proposals, or unrelated grants', async () => {
    const port = new FakeCharacterForgetCommandAuthorityPortV1();
    port.result = Object.freeze([
      {
        ...SUCCESS_ROW,
        characterDeleted: true,
        relationshipReset: true,
        lifeFactsDeleted: 7,
        memoriesDeleted: 8,
        proposalsDeleted: 9,
        otherCharacterGrantsRevoked: 10,
      } as CharacterForgetCommandAuthorityRowV1,
    ]);

    const serialized = JSON.stringify(await forgetCharacter({
      resolvedSubjectId: SUBJECT_ID,
      characterId: CHARACTER_ID,
      authorityPort: port,
    }));

    expect(serialized).not.toContain('characterDeleted');
    expect(serialized).not.toContain('relationshipReset');
    expect(serialized).not.toContain('lifeFactsDeleted');
    expect(serialized).not.toContain('memoriesDeleted');
    expect(serialized).not.toContain('proposalsDeleted');
    expect(serialized).not.toContain('otherCharacterGrantsRevoked');
  });

  it('requires trusted subject and a nonblank route character identity before DB authority', async () => {
    const missingSubjectPort = new FakeCharacterForgetCommandAuthorityPortV1();
    await expectApiCode(
      forgetCharacter({ characterId: CHARACTER_ID, authorityPort: missingSubjectPort }),
      'AUTH_REQUIRED',
    );
    expect(missingSubjectPort.calls).toHaveLength(0);

    const invalidCharacterPort = new FakeCharacterForgetCommandAuthorityPortV1();
    await expectApiCode(
      forgetCharacter({
        resolvedSubjectId: SUBJECT_ID,
        characterId: '   ',
        authorityPort: invalidCharacterPort,
      }),
      'INVALID_REQUEST',
    );
    expect(invalidCharacterPort.calls).toHaveLength(0);
  });

  it('maps ineligible subject and unknown character probes to the same bounded NOT_FOUND', async () => {
    for (const code of ['SUBJECT_INELIGIBLE', 'CHARACTER_UNAVAILABLE'] as const) {
      const port = new FakeCharacterForgetCommandAuthorityPortV1();
      port.result = new CharacterForgetCommandAuthorityPortErrorV1(
        code,
        'raw authority detail must stay hidden',
      );

      const error = await expectApiCode(
        forgetCharacter({
          resolvedSubjectId: SUBJECT_ID,
          characterId: CHARACTER_ID,
          authorityPort: port,
        }),
        'NOT_FOUND',
      );
      expect(error.message).toBe('Character forget is unavailable for the current subject.');
      expect(error.message).not.toContain('raw authority detail');
    }
  });

  it('maps authority input rejection to INVALID_REQUEST and rethrows infrastructure failures', async () => {
    const invalidPort = new FakeCharacterForgetCommandAuthorityPortV1();
    invalidPort.result = new CharacterForgetCommandAuthorityPortErrorV1(
      'INVALID_INPUT',
      'character id is required',
    );
    await expectApiCode(
      forgetCharacter({
        resolvedSubjectId: SUBJECT_ID,
        characterId: CHARACTER_ID,
        authorityPort: invalidPort,
      }),
      'INVALID_REQUEST',
    );

    const infraPort = new FakeCharacterForgetCommandAuthorityPortV1();
    const failure = new Error('database transport unavailable');
    infraPort.result = failure;
    await expect(forgetCharacter({
      resolvedSubjectId: SUBJECT_ID,
      characterId: CHARACTER_ID,
      authorityPort: infraPort,
    })).rejects.toBe(failure);
  });

  it('fails closed unless authority returns exactly one successful row', async () => {
    const port = new FakeCharacterForgetCommandAuthorityPortV1();
    port.result = Object.freeze([]);
    await expect(forgetCharacter({
      resolvedSubjectId: SUBJECT_ID,
      characterId: CHARACTER_ID,
      authorityPort: port,
    })).rejects.toThrow('exactly one successful row');

    port.result = Object.freeze([SUCCESS_ROW, SUCCESS_ROW]);
    await expect(forgetCharacter({
      resolvedSubjectId: SUBJECT_ID,
      characterId: CHARACTER_ID,
      authorityPort: port,
    })).rejects.toThrow('exactly one successful row');
  });

  it('fails closed on identity mismatch, invalid count, invalid replay marker, or inconsistent count/replay state', async () => {
    const port = new FakeCharacterForgetCommandAuthorityPortV1();

    port.result = Object.freeze([
      Object.freeze({ ...SUCCESS_ROW, characterId: 'forget-beta' }),
    ]);
    await expect(forgetCharacter({
      resolvedSubjectId: SUBJECT_ID,
      characterId: CHARACTER_ID,
      authorityPort: port,
    })).rejects.toThrow('different character identity');

    port.result = Object.freeze([
      Object.freeze({ ...SUCCESS_ROW, revokedGrantCount: -1 }),
    ]);
    await expect(forgetCharacter({
      resolvedSubjectId: SUBJECT_ID,
      characterId: CHARACTER_ID,
      authorityPort: port,
    })).rejects.toThrow('invalid revokedGrantCount');

    port.result = Object.freeze([
      { ...SUCCESS_ROW, replayed: 'yes' } as unknown as CharacterForgetCommandAuthorityRowV1,
    ]);
    await expect(forgetCharacter({
      resolvedSubjectId: SUBJECT_ID,
      characterId: CHARACTER_ID,
      authorityPort: port,
    })).rejects.toThrow('invalid replay marker');

    port.result = Object.freeze([
      Object.freeze({ ...SUCCESS_ROW, revokedGrantCount: 0, replayed: false }),
    ]);
    await expect(forgetCharacter({
      resolvedSubjectId: SUBJECT_ID,
      characterId: CHARACTER_ID,
      authorityPort: port,
    })).rejects.toThrow('inconsistent count/replay state');

    port.result = Object.freeze([
      Object.freeze({ ...SUCCESS_ROW, revokedGrantCount: 2, replayed: true }),
    ]);
    await expect(forgetCharacter({
      resolvedSubjectId: SUBJECT_ID,
      characterId: CHARACTER_ID,
      authorityPort: port,
    })).rejects.toThrow('inconsistent count/replay state');
  });
});
