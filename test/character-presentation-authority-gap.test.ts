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

describe('Character presentation identity authority gap', () => {
  it('keeps canonical Character ids distinct from the browser presentation namespace', async () => {
    const [immutableAuthoring, browserPresentation] = await Promise.all([
      readFile(immutableAuthoringPath, 'utf8'),
      readFile(browserPresentationPath, 'utf8'),
    ]);

    expect(immutableAuthoring).toContain("  'doyun',");
    expect(immutableAuthoring).not.toContain("  'doyoon',");
    expect(browserPresentation).toContain('doyoon: {');
    expect(browserPresentation).not.toContain('doyun: {');
  });

  it('keeps the Production presentation mapping unbound instead of inferring it from content shape', async () => {
    const [schema, resolver] = await Promise.all([
      readFile(schemaPath, 'utf8'),
      readFile(resolverPath, 'utf8'),
    ]);

    expect(schema).toContain('readonly characterId: string;');
    expect(schema).toContain('readonly displayName: string;');
    expect(schema).not.toContain('presentationKey');
    expect(resolver).toContain('production storage/query');
    expect(resolver).toContain('binding for this mapping has not been decided');
  });

  it('keeps thread routes presentation-neutral until the missing mapping authority exists', async () => {
    const browserPresentation = await readFile(browserPresentationPath, 'utf8');

    expect(browserPresentation).toContain(
      "presentationCharacterKey ?? (hasThreadRoute ? null : 'baekheon')",
    );
    expect(browserPresentation).toContain("'thread_identity_pending'");
    expect(browserPresentation).toContain("'thread_identity_invalid'");
  });
});
