import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const webRoot = join(root, 'apps', 'web');
const authPage = readFileSync(join(webRoot, 'auth-page.js'), 'utf8');
const authCss = readFileSync(join(webRoot, 'auth.css'), 'utf8');
const myPage = readFileSync(join(webRoot, 'my-page.js'), 'utf8');

describe('web auth recovery boundary', () => {
  it('keeps signup-only password confirmation visually hidden during sign-in', () => {
    expect(authPage).toContain("byId('auth-confirm-field').hidden = mode !== 'sign-up'");
    expect(authCss).toContain('.auth-field[hidden]');
    expect(authCss).toMatch(/\.auth-field\[hidden\]\s*\{[^}]*display:\s*none\s*!important/);
  });

  it('does not redirect a stale stored member session away from reauthentication', () => {
    expect(authPage).toContain('현재 브라우저에 이전 로그인 세션이 있습니다.');
    expect(authPage).not.toContain("setTimeout(() => location.assign(nextHref()), 350)");
    expect(authPage).not.toContain('이미 로그인되어 있습니다. 잠시 후 이전 화면으로 이동합니다.');
  });

  it('preserves only the exact signup Guest bearer across email-confirmation tabs with bounded email matching', () => {
    expect(authPage).toContain("const CONFIRMATION_GUEST_HANDOFF_KEY = 'myeongha.pendingGuestConfirmation.v1'");
    expect(authPage).toContain('CONFIRMATION_GUEST_HANDOFF_TTL_MS');
    expect(authPage).toContain('stageConfirmationGuestHandoff(result.email)');
    expect(authPage).toContain('readConfirmationGuestHandoff(memberEmail)');
    expect(authPage).toContain('expectedEmail !== handoffEmail');
    expect(authPage).toContain("'X-MyeongHa-Guest-Bearer': guestBearer");
    expect(authPage).toContain('clearConfirmationGuestHandoff()');
    expect(authPage).not.toContain('subjectId');
    expect(authPage).not.toContain('authUserId');
  });

  it('keeps existing-member plus separate-Guest promotion fail closed', () => {
    expect(authPage).toContain("response.status === 409 && code === 'GUEST_MERGE_REQUIRED'");
    expect(authPage).toContain("return { status: 'merge-required' }");
    expect(authPage).toContain('임의로 합치지 않고 그대로 보존했습니다.');
  });

  it('exposes logout/session-clear recovery when My receives AUTH_REQUIRED with a stored member session', () => {
    expect(myPage).toContain('const hasStoredMemberSession = Boolean(readMemberSession())');
    expect(myPage).toContain("link.textContent = hasStoredMemberSession ? '다시 로그인 →' : '로그인하기 →'");
    expect(myPage).toContain("button.textContent = '로그아웃'");
    expect(myPage).toContain('await signOutMember()');
    expect(myPage).toContain('내 정보를 보려면 현재 세션이 필요합니다.');
  });
});
