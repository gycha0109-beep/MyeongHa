import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

function read(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

describe('social login button surfaces', () => {
  it('shows Google, Kakao, and Naver on both mobile and web login surfaces', () => {
    const mobile = read('apps/mobile/src/features/my/MyComponents.tsx');
    const web = read('apps/web/src/auth/AuthPage.tsx');

    for (const label of ['Google로 계속', '카카오로 계속', '네이버로 계속']) {
      expect(mobile).toContain(label);
      expect(web).toContain(label);
    }
  });

  it('keeps the web surface provider-addressable without reusing the mobile deep link', () => {
    const web = read('apps/web/src/auth/AuthPage.tsx');

    expect(web).toContain("data-provider={provider}");
    expect(web).toContain("handleSocialSignIn(provider)");
    expect(web).not.toContain('myeongha://auth/callback');
  });
});
