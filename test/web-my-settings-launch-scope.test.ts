import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const loadWeb = (path: string) =>
  readFile(new URL('../apps/web/' + path, import.meta.url), 'utf8');

describe('My settings and approved dashboard layout', () => {
  it('follows the approved product hierarchy without redundant redirects or Today panel', async () => {
    const page = await loadWeb('src/my/MyPage.tsx');
    for (const item of [
      '마이페이지',
      '계정 정보',
      '캐릭터 메모리',
      '구매 내역',
      '내 이용권',
      '설정 및 지원',
      '출생 정보',
      '화면 및 언어',
      '문의',
      '메모리 관리하기',
      'MY PAGE',
    ]) expect(page).toContain(item);
    for (const removed of [
      '오늘의 나',
      '최근 이어진 것',
      '내 흐름',
      '호칭을 설정해주세요',
      '<FlowSection',
      '<RecentSection',
      '<BirthSection',
      '도움말 · 고객지원',
    ]) expect(page).not.toContain(removed);
    expect(page).toContain('my-choice-grid my-settings-grid');
    expect(page).toContain('my-memory-section');
  });

  it('keeps real account and birth reads and signed-in/out actions', async () => {
    const [page, client] = await Promise.all([
      loadWeb('src/my/MyPage.tsx'),
      loadWeb('my-runtime-client.js'),
    ]);
    for (const expected of [
      'client.readProfile()',
      'client.readBirthProfile()',
      "payload.subjectKind === 'member'",
      'payload.subjectStatus',
      'readMemberSession()',
      'session?.user?.email',
      'signOutMember()',
      "auth.html?next=my.html",
      'WEB_MY_SESSION_REQUIRED',
      '현재 세션 권한이 더 이상 유효하지 않아 내 정보를 표시하지 않습니다.',
    ]) expect(page).toContain(expected);
    expect(client).toContain("const DEFAULT_PROFILE_ENDPOINT = '/api/me'");
    expect(client).toContain("method: 'GET'");
    const router = await readFile(new URL('../workers/cloudflare-api-router.mjs', import.meta.url), 'utf8');
    expect(router).not.toContain('source: "/api/me/entitlements"');
    expect(page).not.toContain("method: 'PATCH'");
    expect(page).not.toContain("method: 'DELETE'");
  });

  it('shows commerce, memory and support without inventing unavailable server data', async () => {
    const [page, css] = await Promise.all([
      loadWeb('src/my/MyPage.tsx'),
      loadWeb('my.css'),
    ]);
    expect(page).toContain('캐릭터별 메모리 조회·저장 기능은 아직 연결되지 않았습니다.');
    expect(page).toContain('구매 내역 조회가 연결되지 않았습니다.');
    expect(page).toContain('이용권 조회가 연결되지 않았습니다.');
    expect(page).toContain('href="contact.html"');
    expect(page).toContain('<strong><MyText source="문의" /></strong>');
    expect(page).not.toContain('관리자 문의 페이지와 접수 기능은 준비 중입니다.');
    expect(page).not.toContain('잔여 이용권 0');
    expect(page).not.toContain('프리미엄');
    expect(page).not.toContain('구독 중');
    expect(css).toContain('my-hero-art.webp');
    expect(css).toContain('my-memory-art.webp');
    expect(css).toContain('var(--my-paper-strong)');
    expect(css).toContain('@media (max-width: 520px)');
  });

  it('keeps theme and language actions connected to the existing header controls', async () => {
    const page = await loadWeb('src/my/MyPage.tsx');
    expect(page).toContain("'.product-theme-toggle'");
    expect(page).toContain("'.ui-locale-select'");
    expect(page).toContain("picker.dispatchEvent(new Event('change'");
    expect(page).toContain('aria-expanded');
  });
});
