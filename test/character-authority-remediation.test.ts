import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

const removedOverclaims = [
  'packages/character-content/src/initial-roster.ts',
  'test/character-initial-roster.test.ts',
  'test/character-initial-roster-json-authoring.test.ts',
  'packages/character-content/authoring/initial-roster/README.md',
  'packages/character-content/authoring/initial-roster/seyeon.json',
  'packages/character-content/authoring/initial-roster/yeoul.json',
  'packages/character-content/authoring/initial-roster/seorin.json',
  'packages/character-content/authoring/initial-roster/rahyeon.json',
  'packages/character-content/authoring/initial-roster/mira_working.json',
  'packages/character-content/authoring/initial-roster/taegyeom.json',
  'packages/character-content/authoring/initial-roster/yunho.json',
  'packages/character-content/authoring/initial-roster/doyoon.json',
  'packages/character-content/authoring/initial-roster/baekheon.json',
] as const;

describe('Character source-authority remediation', () => {
  it('removes detailed roster authoring that exceeded Character Concept V1 source authority', () => {
    for (const relativePath of removedOverclaims) {
      expect(existsSync(join(ROOT, relativePath)), relativePath).toBe(false);
    }
  });

  it('exports only the source-safe working roster entrypoint', () => {
    const index = readFileSync(
      join(ROOT, 'packages/character-content/src/index.ts'),
      'utf8',
    );

    expect(index).toContain("export * from './working-roster.js';");
    expect(index).not.toContain("export * from './initial-roster.js';");
  });
});
