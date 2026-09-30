import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRepoFile(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile existing-Member auth foundation structure', () => {
  it('keeps Member credentials in a distinct SecureStore key from Guest credentials', async () => {
    const guest = await readRepoFile('apps/mobile/src/core/auth/guest-credential-store.ts');
    const member = await readRepoFile('apps/mobile/src/core/auth/member-session-store.ts');

    expect(guest).toContain('myeongha.mobile.guestCredential.v1');
    expect(member).toContain('myeongha.mobile.memberSession.v1');
    expect(member).not.toContain('MOBILE_GUEST_CREDENTIAL_KEY_V1');
  });

  it('does not activate mobile sign-up before a mobile confirmation/deep-link contract exists', async () => {
    const api = await readRepoFile('packages/api-client/src/member-auth.ts');
    expect(api).toContain('/api/auth/sign-in');
    expect(api).toContain('/api/auth/refresh');
    expect(api).toContain('/api/auth/sign-out');
    expect(api).not.toContain('/api/auth/sign-up');
  });

  it('does not clear Guest authority as a side effect of existing-Member sign-in/out', async () => {
    const coordinator = await readRepoFile('apps/mobile/src/core/session/mobile-member-session.ts');
    expect(coordinator).not.toContain('guestCredential');
    expect(coordinator).not.toContain('MOBILE_GUEST');
  });

  it('does not activate Chat open/send in the Member auth foundation', async () => {
    const coordinator = await readRepoFile('apps/mobile/src/core/session/mobile-member-session.ts');
    expect(coordinator).not.toContain('/api/chat');
    expect(coordinator).not.toContain('clientCapability');
  });
});
