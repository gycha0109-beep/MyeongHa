import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const API_SOURCE_DIR = new URL('../apps/api/src/', import.meta.url);
const PUBLIC_FACADE_FILES = new Set(['index.ts']);

describe('API error dependency boundary', () => {
  it('keeps internal ApiCommandError consumers decoupled from chat-receive', async () => {
    const filenames = (await readdir(API_SOURCE_DIR))
      .filter((filename) => filename.endsWith('.ts'))
      .sort();

    const offenders: string[] = [];
    for (const filename of filenames) {
      if (filename === 'chat-receive.ts' || PUBLIC_FACADE_FILES.has(filename)) continue;
      const source = await readFile(new URL(filename, API_SOURCE_DIR), 'utf8');
      if (
        source.includes('ApiCommandError') &&
        source.includes("from './chat-receive.js'")
      ) {
        offenders.push(filename);
      }
    }

    expect(offenders).toEqual([]);
  });
});
