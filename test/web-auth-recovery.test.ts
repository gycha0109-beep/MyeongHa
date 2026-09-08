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

  it('serializes bounded multi-entry signup Guest handoff mutations across browser tabs', () => {
    expect(authPage).toContain("const CONFIRMATION_GUEST_HANDOFF_KEY = 'myeongha.pendingGuestConfirmation.v1'");
    expect(authPage).toContain('const CONFIRMATION_GUEST_HANDOFF_VERSION = 2');
    expect(authPage).toContain("const CONFIRMATION_GUEST_HANDOFF_LOCK_NAME = 'myeongha.pendingGuestConfirmation.v1.lock'");
    expect(authPage).toContain("const CONFIRMATION_GUEST_HANDOFF_JOURNAL_MARKER_KEY = 'myeongha.pendingGuestConfirmation.journal.v1'");
    expect(authPage).toContain("const CONFIRMATION_GUEST_HANDOFF_ENTRY_PREFIX = 'myeongha.pendingGuestConfirmation.entry.v1.'");
    expect(authPage).toContain('CONFIRMATION_GUEST_HANDOFF_TTL_MS');
    expect(authPage).toContain('globalThis.navigator?.locks');
    expect(authPage).toContain("locks.request(CONFIRMATION_GUEST_HANDOFF_LOCK_NAME, { mode: 'exclusive' }");
    expect(authPage).toContain('writeConfirmationGuestHandoffJournalEntry(entry)');
    expect(authPage).toContain('ensureConfirmationGuestHandoffJournalInitialized()');
    expect(authPage).toContain('readConfirmationGuestHandoffJournalCandidates()');
    expect(authPage).toContain('removeConfirmationGuestHandoffJournalMatches(expectedEmail, promotedGuestBearer)');
    expect(authPage).toContain('async function stageConfirmationGuestHandoff(email)');
    expect(authPage).toContain('if (!locks) return false');
    expect(authPage).toContain('if (!await stageConfirmationGuestHandoff(result.email))');
    expect(authPage).toContain('async function readConfirmationGuestHandoff(memberEmail)');
    expect(authPage).toContain('async function clearConfirmationGuestHandoffIfMatches(memberEmail, promotedGuestBearer)');
    expect(authPage).toContain('await clearConfirmationGuestHandoffIfMatches(memberEmail, guestBearer)');
    expect(authPage).toContain('Array.isArray(stored.entries)');
    expect(authPage).toContain('entry.email === expectedEmail');
    expect(authPage).toContain('if (matches.length !== 1) return null');
    expect(authPage).toContain("'X-MyeongHa-Guest-Bearer': guestBearer");
    expect(authPage).not.toContain('subjectId');
    expect(authPage).not.toContain('authUserId');
  });

  it('treats confirmation handoff journal read failure as unknown authority instead of absence or malformed cleanup', () => {
    expect(authPage).toContain("'WEB_AUTH_CONFIRMATION_HANDOFF_READ_FAILED'");
    expect(authPage).toContain('function readConfirmationGuestHandoffLocal(key)');
    expect(authPage).toContain('throw confirmationGuestHandoffReadFailure(error)');
    expect(authPage).toContain('const raw = readConfirmationGuestHandoffLocal(key)');
    expect(authPage).toContain("error.code === 'WEB_AUTH_CONFIRMATION_HANDOFF_READ_FAILED'");
    expect(authPage).toContain('throw error;');
    expect(authPage).toContain('브라우저 저장소 접근을 복구한 뒤 다시 로그인해 주세요.');
    expect(authPage).not.toContain("function hasConfirmationGuestHandoffJournal() {\n  try {\n    return localStorage.getItem(CONFIRMATION_GUEST_HANDOFF_JOURNAL_MARKER_KEY) === '1';\n  } catch {\n    return false;\n  }\n}");
    expect(authPage).not.toContain("const raw = localStorage.getItem(key);\n      const normalized = raw ? normalizeConfirmationGuestHandoff(JSON.parse(raw)) : null;");
    expect(authPage).not.toContain("catch {\n      try {\n        localStorage.removeItem(key);\n      } catch {}\n    }");
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
