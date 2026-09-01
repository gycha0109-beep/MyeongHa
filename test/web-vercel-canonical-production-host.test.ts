import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const vercelConfigPath = new URL('../vercel.json', import.meta.url);

type HeaderMatch = {
  type: string;
  key: string;
  value?: {
    pre?: string;
    suf?: string;
  };
};

type RedirectRule = {
  source: string;
  destination: string;
  permanent?: boolean;
  has?: HeaderMatch[];
};

describe('Vercel canonical production host routing', () => {
  it('redirects generated MyeongHa deployment hosts to the stable production alias', async () => {
    const config = JSON.parse(await readFile(vercelConfigPath, 'utf8')) as {
      redirects?: RedirectRule[];
    };

    const redirect = config.redirects?.find(
      (rule) => rule.destination === 'https://myeongha.vercel.app/:path*',
    );

    expect(redirect).toBeDefined();
    expect(redirect?.source).toBe('/:path*');
    expect(redirect?.permanent).toBe(false);

    const hostMatch = redirect?.has?.find(
      (condition) => condition.type === 'header' && condition.key.toLowerCase() === 'host',
    );

    expect(hostMatch?.value).toEqual({
      pre: 'myeongha-',
      suf: '-johnny-self.vercel.app',
    });

    const matchesGeneratedHost = (host: string) =>
      host.startsWith(hostMatch?.value?.pre ?? '') &&
      host.endsWith(hostMatch?.value?.suf ?? '');

    expect(matchesGeneratedHost('myeongha-eujadwdrx-johnny-self.vercel.app')).toBe(true);
    expect(matchesGeneratedHost('myeongha-q95qezvmj-johnny-self.vercel.app')).toBe(true);
    expect(matchesGeneratedHost('myeongha.vercel.app')).toBe(false);
    expect(matchesGeneratedHost('myeongha-johnny-self.vercel.app')).toBe(false);
  });
});
