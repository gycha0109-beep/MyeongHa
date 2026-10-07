import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const authPage = readFileSync(resolve(root, 'apps/web/auth-page.js'), 'utf8');
const productAuth = readFileSync(resolve(root, 'apps/web/product-auth.js'), 'utf8');
const refreshRoute = readFileSync(resolve(root, 'api/auth/refresh.ts'), 'utf8');

describe('web social auth live flow', () => {
  it('starts provider OAuth instead of rendering placeholder-only buttons', () => {
    expect(authPage).toContain("fetch('/api/auth/social/start'");
    expect(authPage).toContain('WEB_SOCIAL_AUTH_CALLBACK_URI');
    expect(authPage).toContain('location.assign(authorizationUrl.toString())');
    expect(authPage).toContain('startSocial: startSocialAuth');
  });

  it('pins callback state to the same browser Guest before committing Member', () => {
    expect(productAuth).toContain("const WEB_SOCIAL_AUTH_PENDING_KEY = 'myeongha.webSocialAuthPending.v1'");
    expect(authPage).toContain('returnedState !== pending.state');
    expect(authPage).toContain('readGuestBearer() !== pending.guestBearer');
    expect(authPage).toContain('signInWithSocialRefreshToken(refreshToken)');
    expect(authPage).toContain('await finishAuthenticated(session)');
    expect(authPage).not.toContain('sessionStorage.setItem');
  });

  it('moves the provider refresh token into the existing HttpOnly-cookie web session rail', () => {
    expect(productAuth).toContain('__myeongha_social_complete=1');
    expect(refreshRoute).toContain("routeId: 'api.auth.social.complete'");
    expect(refreshRoute).toContain("routeId: 'api.auth.refresh'");
    expect(refreshRoute).toContain("action: 'social-complete'");
  });
});
