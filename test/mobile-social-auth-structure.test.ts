import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRepoFile(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile social auth structure', () => {
  it('keeps all social auth through the governed service and existing Member session store', async () => {
    const hook = await readRepoFile(
      'apps/mobile/src/features/my/use-mobile-member-auth.tsx',
    );
    const service = await readRepoFile(
      'apps/mobile/src/core/auth/mobile-social-auth.ts',
    );

    expect(hook).toContain('nativeMobileSocialAuthServiceV1');
    expect(service).toContain('promoteGuestToNewMemberV1');
    expect(service).toContain('memberStore.write');
    expect(service).toContain('GUEST_MERGE_REQUIRED');
    expect(service).not.toContain('fetch(');
  });

  it('exposes Google, Kakao, and Naver buttons without embedding provider secrets', async () => {
    const components = await readRepoFile(
      'apps/mobile/src/features/my/MyComponents.tsx',
    );
    const packageJson = await readRepoFile('apps/mobile/package.json');
    const appJson = await readRepoFile('apps/mobile/app.json');

    expect(components).toContain('Google로 계속');
    expect(components).toContain('카카오로 계속');
    expect(components).toContain('네이버로 계속');
    expect(packageJson).not.toContain('@supabase/supabase-js');
    expect(packageJson).not.toContain('expo-auth-session');
    expect(appJson).toContain('"scheme": "myeongha"');
    expect(components).not.toContain('client_secret');
  });

  it('keeps provider activation fail-closed on the server', async () => {
    const runtime = await readRepoFile(
      'apps/api/src/social-auth-start-http.ts',
    );
    expect(runtime).toContain('SOCIAL_AUTH_PROVIDER_DISABLED');
    expect(runtime).toContain('MYEONGHA_SOCIAL_AUTH_GOOGLE_ENABLED');
    expect(runtime).toContain('MYEONGHA_SOCIAL_AUTH_KAKAO_ENABLED');
    expect(runtime).toContain('MYEONGHA_SOCIAL_AUTH_NAVER_ENABLED');
    expect(runtime).toContain("'custom:naver'");
  });

  it('reuses the governed sign-in Vercel function instead of consuming a 13th function slot', async () => {
    const vercel = await readRepoFile('vercel.json');
    const signInRoute = await readRepoFile('api/auth/sign-in.ts');

    expect(vercel).toContain('"source": "/api/auth/social/start"');
    expect(vercel).toContain(
      '"destination": "/api/auth/sign-in?__myeongha_social_auth_start=1"',
    );
    expect(signInRoute).toContain("routeId: 'api.auth.sign-in'");
    expect(signInRoute).toContain("routeId: 'api.auth.social.start'");
    expect(signInRoute).toContain('handleSocialAuthStartRequestV1');
  });
});
