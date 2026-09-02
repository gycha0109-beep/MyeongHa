import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type VercelConfig = {
  rewrites?: Array<{
    source: string;
    destination: string;
  }>;
};

describe('Vercel Birth Profile read routing', () => {
  it('maps the public dynamic path to the deployed bracket function', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
    ) as VercelConfig;

    expect(config.rewrites).toContainEqual({
      source: '/api/birth-profiles/:id',
      destination: '/api/birth-profiles/[id]',
    });
  });
});
