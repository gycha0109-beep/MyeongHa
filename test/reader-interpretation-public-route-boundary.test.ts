import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import meEndpoint from '../api/me.js';

const vercelConfigPath = new URL('../vercel.json', import.meta.url);
const READER_ROUTE = '/api/me/readings/reader-interpretation/preview';

describe('Reader Interpretation public route activation boundary', () => {
  it('keeps the public Reader Interpretation rewrite absent until activation is explicitly approved', async () => {
    const config = JSON.parse(await readFile(vercelConfigPath, 'utf8')) as {
      rewrites?: Array<{ source?: string; destination?: string }>;
    };

    expect(config.rewrites?.some((rule) => rule.source === READER_ROUTE)).toBe(false);
  });

  it('fails the unactivated Reader Interpretation pathname closed at the production dispatcher', async () => {
    const response = await meEndpoint.fetch(
      new Request(`https://myeongha.example${READER_ROUTE}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          threadId: 'thread-1',
          officialReadingId: 'reading-1',
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.text()).resolves.toBe('');
  });
});
