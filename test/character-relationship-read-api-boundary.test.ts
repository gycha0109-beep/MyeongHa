import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  CHARACTER_RELATIONSHIP_READ_AUTHORITY_BINDING_V1,
  CharacterRelationshipReadAuthorityPortErrorV1,
  getCharacterRelationship,
  type CharacterRelationshipCurrentAuthorityRowV1,
  type CharacterRelationshipReadAuthorityPortV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = '99000000-0000-0000-0000-000000000001';
const CHARACTER_ID = 'relationship-alpha';

const CURRENT_ROW: CharacterRelationshipCurrentAuthorityRowV1 = Object.freeze({
  stateId: '99000000-0000-0000-0000-000000000101',
  characterId: CHARACTER_ID,
  closeness: 14,
  trust: 9,
  friction: 2,
  relationshipStage: 'acquainted',
  policyVersion: 'relationship-policy-v1',
  revision: 2,
  lastInteractionAt: '2026-08-25T10:00:00.000Z',
  updatedAt: '2026-08-25T10:00:00.000Z',
});

class FakeCharacterRelationshipReadAuthorityPortV1
  implements CharacterRelationshipReadAuthorityPortV1 {
  readonly calls: Array<{ subjectId: string; characterId: string }> = [];
  result: readonly CharacterRelationshipCurrentAuthorityRowV1[] | Error = Object.freeze([
    CURRENT_ROW,
  ]);

  readCurrentRelationship(input: {
    readonly subjectId: string;
    readonly characterId: string;
  }): readonly CharacterRelationshipCurrentAuthorityRowV1[] {
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

describe('Character relationship read API authority boundary', () => {
  it('pins GET /api/characters/:id/relationship to the verified stored projection query', () => {
    expect(CHARACTER_RELATIONSHIP_READ_AUTHORITY_BINDING_V1)
      .toBe('public.qry_character_relationship_v1');
  });

  it('returns the stored current relationship projection exactly', async () => {
    const port = new FakeCharacterRelationshipReadAuthorityPortV1();

    const result = await getCharacterRelationship({
      resolvedSubjectId: SUBJECT_ID,
      characterId: CHARACTER_ID,
      authorityPort: port,
    });

    expect(port.calls).toEqual([{ subjectId: SUBJECT_ID, characterId: CHARACTER_ID }]);
    expect(result).toEqual({ relationship: CURRENT_ROW });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.relationship)).toBe(true);
  });

  it('returns null when no stored subject/character state exists instead of fabricating a baseline', async () => {
    const port = new FakeCharacterRelationshipReadAuthorityPortV1();
    port.result = Object.freeze([]);

    const result = await getCharacterRelationship({
      resolvedSubjectId: SUBJECT_ID,
      characterId: CHARACTER_ID,
      authorityPort: port,
    });

    expect(result).toEqual({ relationship: null });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('relationshipStage');
    expect(serialized).not.toContain('closeness');
    expect(serialized).not.toContain('trust');
    expect(serialized).not.toContain('friction');
  });

  it('keeps a stored retired-character projection readable without inventing content availability semantics', async () => {
    const port = new FakeCharacterRelationshipReadAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({
        ...CURRENT_ROW,
        stateId: '99000000-0000-0000-0000-000000000102',
        characterId: 'relationship-retired',
        revision: 0,
        lastInteractionAt: null,
      }),
    ]);

    await expect(getCharacterRelationship({
      resolvedSubjectId: SUBJECT_ID,
      characterId: 'relationship-retired',
      authorityPort: port,
    })).resolves.toEqual({
      relationship: {
        ...CURRENT_ROW,
        stateId: '99000000-0000-0000-0000-000000000102',
        characterId: 'relationship-retired',
        revision: 0,
        lastInteractionAt: null,
      },
    });
  });

  it('does not expose event-ledger reconstruction, score deltas, stage rules, cooldowns, unlocks, or write controls', async () => {
    const port = new FakeCharacterRelationshipReadAuthorityPortV1();
    port.result = Object.freeze([
      {
        ...CURRENT_ROW,
        relationshipEvents: [{ eventType: 'RETURN_VISIT' }],
        deltaCloseness: 4,
        stagePromotionRule: 'invented',
        interactionWeight: 9,
        cooldownSeconds: 3600,
        characterUnlocked: true,
        canUpdateRelationship: true,
      } as CharacterRelationshipCurrentAuthorityRowV1,
    ]);

    const serialized = JSON.stringify(await getCharacterRelationship({
      resolvedSubjectId: SUBJECT_ID,
      characterId: CHARACTER_ID,
      authorityPort: port,
    }));

    for (const forbidden of [
      'relationshipEvents',
      'deltaCloseness',
      'stagePromotionRule',
      'interactionWeight',
      'cooldownSeconds',
      'characterUnlocked',
      'canUpdateRelationship',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('requires trusted subject and a nonblank route character identity before DB authority', async () => {
    const missingSubjectPort = new FakeCharacterRelationshipReadAuthorityPortV1();
    await expectApiCode(
      getCharacterRelationship({ characterId: CHARACTER_ID, authorityPort: missingSubjectPort }),
      'AUTH_REQUIRED',
    );
    expect(missingSubjectPort.calls).toHaveLength(0);

    const invalidCharacterPort = new FakeCharacterRelationshipReadAuthorityPortV1();
    await expectApiCode(
      getCharacterRelationship({
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
      const port = new FakeCharacterRelationshipReadAuthorityPortV1();
      port.result = new CharacterRelationshipReadAuthorityPortErrorV1(
        code,
        'raw authority detail must stay hidden',
      );

      const error = await expectApiCode(
        getCharacterRelationship({
          resolvedSubjectId: SUBJECT_ID,
          characterId: CHARACTER_ID,
          authorityPort: port,
        }),
        'NOT_FOUND',
      );
      expect(error.message).toBe(
        'Character relationship is unavailable for the current subject.',
      );
      expect(error.message).not.toContain('raw authority detail');
    }
  });

  it('maps authority input rejection to INVALID_REQUEST and rethrows infrastructure failures', async () => {
    const invalidPort = new FakeCharacterRelationshipReadAuthorityPortV1();
    invalidPort.result = new CharacterRelationshipReadAuthorityPortErrorV1(
      'INVALID_INPUT',
      'relationship subject/character identity is required',
    );
    await expectApiCode(
      getCharacterRelationship({
        resolvedSubjectId: SUBJECT_ID,
        characterId: CHARACTER_ID,
        authorityPort: invalidPort,
      }),
      'INVALID_REQUEST',
    );

    const infraPort = new FakeCharacterRelationshipReadAuthorityPortV1();
    const failure = new Error('database transport unavailable');
    infraPort.result = failure;
    await expect(getCharacterRelationship({
      resolvedSubjectId: SUBJECT_ID,
      characterId: CHARACTER_ID,
      authorityPort: infraPort,
    })).rejects.toBe(failure);
  });

  it('fails closed when authority returns more than one current projection row', async () => {
    const port = new FakeCharacterRelationshipReadAuthorityPortV1();
    port.result = Object.freeze([CURRENT_ROW, CURRENT_ROW]);

    await expect(getCharacterRelationship({
      resolvedSubjectId: SUBJECT_ID,
      characterId: CHARACTER_ID,
      authorityPort: port,
    })).rejects.toThrow('more than one current projection row');
  });

  it('fails closed when authority returns a different character identity', async () => {
    const port = new FakeCharacterRelationshipReadAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({ ...CURRENT_ROW, characterId: 'relationship-beta' }),
    ]);

    await expect(getCharacterRelationship({
      resolvedSubjectId: SUBJECT_ID,
      characterId: CHARACTER_ID,
      authorityPort: port,
    })).rejects.toThrow('different character identity');
  });
});
