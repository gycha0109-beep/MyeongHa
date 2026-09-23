import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const immutableAuthoringPath = new URL(
  '../packages/character-content/src/immutable-authoring-v1.ts',
  import.meta.url,
);
const schemaPath = new URL(
  '../packages/character-content/src/schema.ts',
  import.meta.url,
);
const resolverPath = new URL(
  '../apps/api/src/character-presentation-resolver.ts',
  import.meta.url,
);
const browserPresentationPath = new URL(
  '../apps/web/chat-character.js',
  import.meta.url,
);

describe('Character presentation identity authority', () => {
  it('uses the approved exact English id for canonical and browser presentation identity', async () => {
    const [immutableAuthoring, browserPresentation] = await Promise.all([
      readFile(immutableAuthoringPath, 'utf8'),
      readFile(browserPresentationPath, 'utf8'),
    ]);

    expect(immutableAuthoring).toContain("  'doyun',");
    expect(immutableAuthoring).not.toContain("  'doyoon',");
    expect(browserPresentation).toContain('doyun: {');
    expect(browserPresentation).not.toContain('doyoon: {');
  });

  it('keeps content schema separate from the explicit browser product mapping', async () => {
    const [schema, resolver] = await Promise.all([
      readFile(schemaPath, 'utf8'),
      readFile(resolverPath, 'utf8'),
    ]);

    expect(schema).toContain('readonly characterId: string;');
    expect(schema).toContain('readonly displayName: string;');
    expect(schema).not.toContain('presentationKey');
    expect(resolver).toContain('CharacterPresentationIdentityAuthorityPortV1');
  });

  it('keeps thread routes neutral until server identity arrives, then permits canonical projection', async () => {
    const browserPresentation = await readFile(browserPresentationPath, 'utf8');

    expect(browserPresentation).toContain(
      "presentationCharacterKey ?? (hasThreadRoute ? null : 'baekheon')",
    );
    expect(browserPresentation).toContain("'thread_identity_pending'");
    expect(browserPresentation).toContain("'thread_identity_invalid'");
    expect(browserPresentation).toContain("root.dataset.characterAuthority = 'canonical_character_id'");
  });
});
