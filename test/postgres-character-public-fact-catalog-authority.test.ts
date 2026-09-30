import { describe, expect, it, vi } from 'vitest';

import {
  createPostgresCharacterPublicFactCatalogReadAuthorityPortV1,
} from '../apps/api/src/postgres-character-public-fact-catalog-authority.js';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';

function client(rows: readonly unknown[]): PostgresTransactionQueryV1 {
  return {
    query: vi.fn(async () => ({ rows })),
  } as unknown as PostgresTransactionQueryV1;
}

describe('PostgreSQL Character PUBLIC fact catalog adapter', () => {
  it('reads the release-pinned PUBLIC catalog in database order', async () => {
    const queryClient = client([
      {
        releaseId: '11111111-1111-4111-8111-111111111111',
        characterId: 'seyeon',
        factKey: 'identity.birthday',
        sourceAuthority: 'CANON',
        characterKnowledge: 'KNOWN',
        disclosureDefault: 'PUBLIC',
        sourceSection: 'B1',
        sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
        sourceBibleRevision: 'source-revision-test',
        value: '3월 18일',
        hasValue: true,
        policy: null,
        closureNote: null,
      },
      {
        releaseId: '11111111-1111-4111-8111-111111111111',
        characterId: 'seyeon',
        factKey: 'identity.name',
        sourceAuthority: 'SOFT_CANON',
        characterKnowledge: 'KNOWN',
        disclosureDefault: 'PUBLIC',
        sourceSection: 'B1',
        sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
        sourceBibleRevision: 'source-revision-test',
        value: '세연',
        hasValue: true,
        policy: null,
        closureNote: 'test note',
      },
    ]);

    const port =
      createPostgresCharacterPublicFactCatalogReadAuthorityPortV1(queryClient);

    await expect(
      port.readPublicFacts({
        releaseId: '11111111-1111-4111-8111-111111111111',
        characterId: 'seyeon',
      }),
    ).resolves.toEqual([
      {
        releaseId: '11111111-1111-4111-8111-111111111111',
        characterId: 'seyeon',
        factKey: 'identity.birthday',
        sourceAuthority: 'CANON',
        characterKnowledge: 'KNOWN',
        disclosureDefault: 'PUBLIC',
        sourceSection: 'B1',
        sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
        sourceBibleRevision: 'source-revision-test',
        value: '3월 18일',
      },
      {
        releaseId: '11111111-1111-4111-8111-111111111111',
        characterId: 'seyeon',
        factKey: 'identity.name',
        sourceAuthority: 'SOFT_CANON',
        characterKnowledge: 'KNOWN',
        disclosureDefault: 'PUBLIC',
        sourceSection: 'B1',
        sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
        sourceBibleRevision: 'source-revision-test',
        value: '세연',
        closureNote: 'test note',
      },
    ]);

    expect(queryClient.query).toHaveBeenCalledWith(
      expect.stringContaining('qry_character_public_fact_catalog_v1'),
      [
        '11111111-1111-4111-8111-111111111111',
        'seyeon',
      ],
    );
  });

  it('maps oversized and unavailable catalog failures to typed errors', async () => {
    for (const [constraint, code] of [
      ['qry_character_public_fact_catalog_too_large', 'CATALOG_TOO_LARGE'],
      ['qry_character_public_fact_catalog_release_unavailable', 'PROVENANCE_MISMATCH'],
      ['qry_character_public_fact_catalog_character_unavailable', 'PROVENANCE_MISMATCH'],
    ] as const) {
      const error = Object.assign(new Error(constraint), { constraint });
      const queryClient = {
        query: vi.fn(async () => {
          throw error;
        }),
      } as unknown as PostgresTransactionQueryV1;
      const port =
        createPostgresCharacterPublicFactCatalogReadAuthorityPortV1(queryClient);

      await expect(
        port.readPublicFacts({
          releaseId: '11111111-1111-4111-8111-111111111111',
          characterId: 'seyeon',
        }),
      ).rejects.toMatchObject({ code });
    }
  });

  it('rejects any row PostgreSQL returns outside the PUBLIC/KNOWN/resolved contract', async () => {
    const queryClient = client([
      {
        releaseId: '11111111-1111-4111-8111-111111111111',
        characterId: 'seyeon',
        factKey: 'past_romance.existence',
        sourceAuthority: 'CANON',
        characterKnowledge: 'KNOWN',
        disclosureDefault: 'FAMILIAR',
        sourceSection: 'J4',
        sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
        sourceBibleRevision: 'source-revision-test',
        value: '과거 연애 경험 있음',
        hasValue: true,
        policy: null,
        closureNote: null,
      },
    ]);
    const port =
      createPostgresCharacterPublicFactCatalogReadAuthorityPortV1(queryClient);

    await expect(
      port.readPublicFacts({
        releaseId: '11111111-1111-4111-8111-111111111111',
        characterId: 'seyeon',
      }),
    ).rejects.toThrow(/disclosure default is invalid/u);
  });
});
