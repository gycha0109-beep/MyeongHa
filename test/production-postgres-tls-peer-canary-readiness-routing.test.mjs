import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const vercelConfigPath = new URL('../vercel.json', import.meta.url);

describe('SEC-01 staged readiness redirect exemption', () => {
  it('exempts only the readiness subtree from the generated-host canonical redirect', async () => {
    const config = JSON.parse(await readFile(vercelConfigPath, 'utf8'));
    const redirect = config.redirects?.find(
      (rule) => rule.destination === 'https://myeongha.vercel.app/:path*',
    );

    expect(redirect?.source).toBe('/:path((?!api/readiness).*)');
    expect(redirect?.has).toEqual([
      {
        type: 'header',
        key: 'host',
        value: {
          pre: 'myeongha-',
          suf: '-johnny-self.vercel.app',
        },
      },
    ]);
    expect(redirect?.permanent).toBe(false);
  });
});
