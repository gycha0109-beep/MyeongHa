import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRepoFile(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile M6 acceptance', () => {
  it('documents known-thread read as complete while discovery/send remain gated and later Member open is explicit', async () => {
    const readme = await readRepoFile('apps/mobile/README.md');
    expect(readme).toContain('known-thread Chat read');
    expect(readme).toContain('thread discovery');
    expect(readme).toContain('Member-only Chat open/reuse');
    expect(readme).toContain('Chat send');
  });

  it('keeps M6 recorded as complete after later mobile phases advance', async () => {
    const architecture = await readRepoFile('docs/MOBILE_CLIENT_ARCHITECTURE_V1.md');
    expect(architecture).toContain('M6  Chat Hub + server-authorized read path               DONE');
  });
});
