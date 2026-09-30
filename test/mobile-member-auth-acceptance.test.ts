import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRepoFile(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile existing-Member auth foundation acceptance', () => {
  it('documents the existing-Member auth prerequisite without claiming M8 Chat send completion', async () => {
    const architecture = await readRepoFile('docs/MOBILE_CLIENT_ARCHITECTURE_V1.md');
    expect(architecture).toContain('M8  Chat send after authority unblock                    BLOCKED');
    expect(architecture).toContain('M8 prerequisite A — existing-Member authentication');
    expect(architecture).toContain('does not define a replacement turn-send HTTP contract');
  });

  it('documents Mobile sign-up as gated by the current Web confirmation redirect contract', async () => {
    const architecture = await readRepoFile('docs/MOBILE_CLIENT_ARCHITECTURE_V1.md');
    expect(architecture).toContain('Mobile sign-up is intentionally not activated');
    expect(architecture).toContain('native confirmation/deep-link handoff contract');
  });

  it('records distinct Guest and Member secure credential authorities', async () => {
    const readme = await readRepoFile('apps/mobile/README.md');
    expect(readme).toContain('SecureStore Guest credential');
    expect(readme).toContain('distinct SecureStore Member session generation');
  });
});
