import { describe, expect, it, vi } from 'vitest';

import {
  publishCharacterFactRegistryV1,
} from '../apps/api/src/postgres-character-fact-registry-publication.js';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';
import type { CharacterFactRegistryPublicationRowV1 } from '../packages/character-content/src/index.js';

const rows: readonly CharacterFactRegistryPublicationRowV1[] = [
  {
    characterId: 'seyeon',
    factKey: 'identity.name',
    sourceAuthority: 'CANON',
    characterKnowledge: 'KNOWN',
    disclosureDefault: 'PUBLIC',
    sourceSection: 'B1',
    sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
    sourceBibleRevision: 'abc123',
    value: '세연',
    closureNote: '채택',
  },
  {
    characterId: 'seyeon',
    factKey: 'backstory.birth_or_growth_region',
    sourceAuthority: 'AUTHOR_UNDEFINED',
    characterKnowledge: 'NOT_APPLICABLE',
    disclosureDefault: 'NOT_APPLICABLE',
    sourceSection: 'J1',
    sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
    sourceBibleRevision: 'abc123',
    closureNote: 'authoring debt',
  },
];

describe('PostgreSQL Character fact registry publication adapter', () => {
  it('publishes the compiler rows without adding values to unresolved facts', async () => {
    const calls: { text: string; values?: readonly unknown[] }[] = [];
    const client: PostgresTransactionQueryV1 = {
      async query<Row>(text: string, values?: readonly unknown[]) {
        calls.push(values === undefined ? { text } : { text, values });
        return {
          rows: [{
            contentBundleId: '11111111-1111-4111-8111-111111111111',
          }] as unknown as Row[],
        };
      },
    };

    await expect(
      publishCharacterFactRegistryV1({
        client,
        contentBundleId: '11111111-1111-4111-8111-111111111111',
        rows,
      }),
    ).resolves.toBe('11111111-1111-4111-8111-111111111111');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain(
      'cmd_publish_character_fact_registry_v1',
    );
    const serialized = calls[0]?.values?.[1];
    expect(typeof serialized).toBe('string');
    const payload = JSON.parse(serialized as string) as Record<string, unknown>[];
    expect(payload[0]).toMatchObject({
      characterId: 'seyeon',
      factKey: 'identity.name',
      value: '세연',
    });
    expect(payload[1]).toMatchObject({
      factKey: 'backstory.birth_or_growth_region',
      sourceAuthority: 'AUTHOR_UNDEFINED',
    });
    expect('value' in payload[1]!).toBe(false);
  });

  it('maps activated-bundle mutation rejection to a typed failure', async () => {
    const error = Object.assign(new Error('already released'), {
      constraint: 'cmd_publish_character_fact_registry_bundle_already_released',
    });
    const client = {
      query: vi.fn(async () => {
        throw error;
      }),
    } as unknown as PostgresTransactionQueryV1;

    await expect(
      publishCharacterFactRegistryV1({
        client,
        contentBundleId: '11111111-1111-4111-8111-111111111111',
        rows,
      }),
    ).rejects.toMatchObject({
      code: 'BUNDLE_ALREADY_RELEASED',
    });
  });

  it('rejects empty publication input before PostgreSQL', async () => {
    const client = {
      query: vi.fn(),
    } as unknown as PostgresTransactionQueryV1;

    await expect(
      publishCharacterFactRegistryV1({
        client,
        contentBundleId: '11111111-1111-4111-8111-111111111111',
        rows: [],
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(client.query).not.toHaveBeenCalled();
  });
});
