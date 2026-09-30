import { describe, expect, it, vi } from 'vitest';

import {
  createPostgresCharacterFactRegistryReadAuthorityPortV1,
} from '../apps/api/src/postgres-character-fact-registry-authority.js';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';

function client(rows: readonly unknown[]): PostgresTransactionQueryV1 {
  return {
    query: vi.fn(async () => ({ rows })),
  } as unknown as PostgresTransactionQueryV1;
}

describe('PostgreSQL Character fact registry authority adapter', () => {
  it('reads the exact release-pinned fact authority row', async () => {
    const queryClient = client([{
      releaseId: '11111111-1111-4111-8111-111111111111',
      characterId: 'seyeon',
      factKey: 'past_romance_surface',
      sourceAuthority: 'CANON',
      characterKnowledge: 'KNOWN',
      disclosureDefault: 'FAMILIAR',
      sourceSection: 'J4',
      sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
      sourceBibleRevision: 'source-revision-test',
      value: { exists: true },
      hasValue: true,
      policy: null,
      closureNote: null,
    }]);

    const port = createPostgresCharacterFactRegistryReadAuthorityPortV1(queryClient);

    await expect(port.readFact({
      releaseId: '11111111-1111-4111-8111-111111111111',
      characterId: 'seyeon',
      factKey: 'past_romance_surface',
    })).resolves.toEqual({
      releaseId: '11111111-1111-4111-8111-111111111111',
      characterId: 'seyeon',
      factKey: 'past_romance_surface',
      sourceAuthority: 'CANON',
      characterKnowledge: 'KNOWN',
      disclosureDefault: 'FAMILIAR',
      sourceSection: 'J4',
      sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
      sourceBibleRevision: 'source-revision-test',
      value: { exists: true },
    });

    expect(queryClient.query).toHaveBeenCalledWith(
      expect.stringContaining('qry_character_fact_registry_v1'),
      [
        '11111111-1111-4111-8111-111111111111',
        'seyeon',
        'past_romance_surface',
      ],
    );
  });

  it('preserves unresolved World-dependent facts without a value field', async () => {
    const queryClient = client([{
      releaseId: '11111111-1111-4111-8111-111111111111',
      characterId: 'seyeon',
      factKey: 'principle_calling_binding',
      sourceAuthority: 'WORLD_DEPENDENT',
      characterKnowledge: 'NOT_APPLICABLE',
      disclosureDefault: 'NOT_APPLICABLE',
      sourceSection: 'World/Principle-Calling',
      sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
      sourceBibleRevision: 'source-revision-test',
      value: null,
      hasValue: false,
      policy: null,
      closureNote: 'Await World authority.',
    }]);

    const port = createPostgresCharacterFactRegistryReadAuthorityPortV1(queryClient);
    const fact = await port.readFact({
      releaseId: '11111111-1111-4111-8111-111111111111',
      characterId: 'seyeon',
      factKey: 'principle_calling_binding',
    });

    expect(fact).toMatchObject({
      sourceAuthority: 'WORLD_DEPENDENT',
      characterKnowledge: 'NOT_APPLICABLE',
      disclosureDefault: 'NOT_APPLICABLE',
      closureNote: 'Await World authority.',
    });
    expect('value' in (fact ?? {})).toBe(false);
  });

  it('returns null when the pinned release has no exact fact row', async () => {
    const port = createPostgresCharacterFactRegistryReadAuthorityPortV1(client([]));

    await expect(port.readFact({
      releaseId: '11111111-1111-4111-8111-111111111111',
      characterId: 'seyeon',
      factKey: 'missing',
    })).resolves.toBeNull();
  });

  it('maps unavailable release authority to a typed not-found failure', async () => {
    const error = Object.assign(new Error('release unavailable'), {
      constraint: 'qry_character_fact_registry_release_unavailable',
    });
    const queryClient = {
      query: vi.fn(async () => {
        throw error;
      }),
    } as unknown as PostgresTransactionQueryV1;
    const port = createPostgresCharacterFactRegistryReadAuthorityPortV1(queryClient);

    await expect(port.readFact({
      releaseId: '11111111-1111-4111-8111-111111111111',
      characterId: 'seyeon',
      factKey: 'past_romance_surface',
    })).rejects.toMatchObject({
      code: 'FACT_NOT_FOUND',
    });
  });

  it('rejects malformed enum values returned by PostgreSQL', async () => {
    const queryClient = client([{
      releaseId: '11111111-1111-4111-8111-111111111111',
      characterId: 'seyeon',
      factKey: 'past_romance_surface',
      sourceAuthority: 'invented',
      characterKnowledge: 'KNOWN',
      disclosureDefault: 'PUBLIC',
      sourceSection: 'J4',
      sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
      sourceBibleRevision: 'source-revision-test',
      value: { exists: true },
      hasValue: true,
      policy: null,
      closureNote: null,
    }]);
    const port = createPostgresCharacterFactRegistryReadAuthorityPortV1(queryClient);

    await expect(port.readFact({
      releaseId: '11111111-1111-4111-8111-111111111111',
      characterId: 'seyeon',
      factKey: 'past_romance_surface',
    })).rejects.toThrow(/source authority is invalid/u);
  });
});
