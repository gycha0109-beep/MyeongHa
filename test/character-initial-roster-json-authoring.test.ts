import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  INITIAL_CHARACTER_ROSTER_DRAFTS,
  hasUnresolvedCharacterAuthority,
} from '../packages/character-content/src/initial-roster.js';

const AUTHORING_DIR = join(
  process.cwd(),
  'packages/character-content/authoring/initial-roster',
);

const expectedFiles = INITIAL_CHARACTER_ROSTER_DRAFTS
  .map((draft) => `${draft.characterId}.json`)
  .sort();

describe('initial roster JSON authoring payloads', () => {
  it('materializes exactly one JSON payload per approved draft character', () => {
    const actualFiles = readdirSync(AUTHORING_DIR)
      .filter((name) => name.endsWith('.json'))
      .sort();

    expect(actualFiles).toEqual(expectedFiles);
    expect(actualFiles).toHaveLength(9);
  });

  it('stays byte-semantically aligned with the typed draft source', () => {
    for (const draft of INITIAL_CHARACTER_ROSTER_DRAFTS) {
      const path = join(AUTHORING_DIR, `${draft.characterId}.json`);
      const payload = JSON.parse(readFileSync(path, 'utf8')) as unknown;

      expect(payload).toEqual(JSON.parse(JSON.stringify(draft)));
    }
  });

  it('keeps all nine payloads fail-closed for Production publication', () => {
    for (const draft of INITIAL_CHARACTER_ROSTER_DRAFTS) {
      expect(draft.productionPublication).toBe('blocked');
      expect(hasUnresolvedCharacterAuthority(draft)).toBe(true);
    }
  });

  it('preserves Mira as a working name rather than silently promoting it', () => {
    const mira = INITIAL_CHARACTER_ROSTER_DRAFTS.find(
      (draft) => draft.characterId === 'mira_working',
    );

    expect(mira?.displayName).toBe('미라');
    expect(mira?.nameStatus).toBe('working');
  });
});
