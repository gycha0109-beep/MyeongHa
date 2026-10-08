import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const loadWeb = (path: string) =>
  readFile(new URL('../apps/web/' + path, import.meta.url), 'utf8');

describe('My settings launch scope', () => {
  it('opens actual account and support information, preserving signed-in/out actions', async () => {
    const page = await loadWeb('src/my/MyPage.tsx');
    for (const expected of [
      "useState<SettingsPanel>(null)",
      "setOpenSettingsPanel('account')",
      'onOpenAccount={openAccountSettings}',
      'aria-expanded={openPanel === \'account\'}',
      'aria-controls="my-account-panel"',
      'aria-labelledby="my-account-panel-trigger"',
      'aria-expanded={openPanel === \'help\'}',
      'aria-controls="my-help-panel"',
      'aria-labelledby="my-help-panel-trigger"',
      '계정 관리',
      '도움말 · 고객지원',
      '자주 묻는 질문',
      '<AuthActions subjectKind={payload?.subjectKind}',
      'signOutMember()',
      "auth.html?next=my.html",
    ]) expect(page).toContain(expected);
    expect(page).not.toContain('my-setting-row is-pending');
  });

  it('uses only server-verified account fields and does not invent mutations', async () => {
    const page = await loadWeb('src/my/MyPage.tsx');
    const client = await loadWeb('my-runtime-client.js');
    const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8')) as {
      rewrites?: Array<{ source: string }>;
    };
    for (const field of ['payload.subjectKind', 'payload.subjectStatus', 'profile?.displayName', 'session?.user?.email']) {
      expect(page).toContain(field);
    }
    expect(client).toContain("const DEFAULT_PROFILE_ENDPOINT = '/api/me'");
    expect(client).toContain("method: 'GET'");
    expect(page).toContain('프로필 변경 및 회원 탈퇴 요청은 검증된 서버 절차가 연결되기 전까지');
    expect(page).not.toContain("method: 'PATCH'");
    expect(page).not.toContain("method: 'DELETE'");
    expect(config.rewrites?.some(x => x.source === '/api/me/entitlements')).toBe(false);
    expect(page).not.toContain('잔여 이용권 0');
    expect(page).not.toContain('알림 켜짐');
  });

  it('uses safe FAQ navigation and a responsive theme-aware panel', async () => {
    const [page, css] = await Promise.all([
      loadWeb('src/my/MyPage.tsx'),
      loadWeb('my.css'),
    ]);
    expect(page).toContain('href="records.html"');
    expect(page).toContain('href="face-reading.html"');
    expect(page).toContain('href="auth.html?next=my.html"');
    expect(page).toContain('공식 문의 접수처와 약관 링크는 확인된 공개 경로가 준비되면');
    expect(css).toContain('.my-setting-trigger:focus-visible');
    expect(css).toContain('.my-setting-detail[hidden]');
    expect(css).toContain('.my-account-facts');
    expect(css).toContain('var(--mh-paper-raised)');
    expect(css).toContain('@media (max-width: 520px)');
  });
});
