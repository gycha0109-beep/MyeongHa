import { describe, expect, it, vi } from 'vitest';

import {
  CharacterRelationshipReadAuthorityPortErrorV1,
} from '../apps/api/src/character-relationship-read.js';
import {
  createPostgresCharacterRelationshipReadAuthorityPortV1,
} from '../apps/api/src/postgres-character-relationship-read.js';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';

function client(rows: readonly unknown[]): PostgresTransactionQueryV1 {
  return {
    query: vi.fn(async () => ({ rows })),
  } as unknown as PostgresTransactionQueryV1;
}

describe('Reader relationship PostgreSQL runtime authority adapter', () => {
  it('projects the current relationship through the owner-scoped query', async () => {
    const queryClient = client([{
      stateId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      characterId: 'baekheon',
      closeness: 42,
      trust: 57,
      friction: 11,
      relationshipStage: 'familiar',
      policyVersion: 'relationship-policy-v1',
      revision: '3',
      lastInteractionAt: '2026-09-21T00:01:20.000Z',
      updatedAt: '2026-09-21T00:01:25.000Z',
    }]);
    const port = createPostgresCharacterRelationshipReadAuthorityPortV1(queryClient);

    await expect(port.readCurrentRelationship({
      subjectId: '11111111-1111-4111-8111-111111111111',
      characterId: 'baekheon',
    })).resolves.toEqual([{
      stateId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      characterId: 'baekheon',
      closeness: 42,
      trust: 57,
      friction: 11,
      relationshipStage: 'familiar',
      policyVersion: 'relationship-policy-v1',
      revision: 3,
      lastInteractionAt: '2026-09-21T00:01:20.000Z',
      updatedAt: '2026-09-21T00:01:25.000Z',
    }]);

    expect(queryClient.query).toHaveBeenCalledWith(
      expect.stringContaining('qry_character_relationship_v1'),
      ['11111111-1111-4111-8111-111111111111', 'baekheon'],
    );
  });

  it('maps subject authority rejection without inventing a baseline relationship', async () => {
    const error = Object.assign(new Error('subject rejected'), {
      constraint: 'qry_character_relationship_subject_ineligible',
    });
    const queryClient = {
      query: vi.fn(async () => {
        throw error;
      }),
    } as unknown as PostgresTransactionQueryV1;
    const port = createPostgresCharacterRelationshipReadAuthorityPortV1(queryClient);

    await expect(port.readCurrentRelationship({
      subjectId: '11111111-1111-4111-8111-111111111111',
      characterId: 'baekheon',
    })).rejects.toMatchObject({
      name: 'CharacterRelationshipReadAuthorityPortErrorV1',
      code: 'SUBJECT_INELIGIBLE',
    } satisfies Partial<CharacterRelationshipReadAuthorityPortErrorV1>);
  });
});
