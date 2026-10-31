import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { translateStaticUi } from '../apps/web/ui-i18n.js';

const webRoot = resolve(process.cwd(), 'apps/web');
const read = (file: string) => readFileSync(resolve(webRoot, file), 'utf8');
const locales = ['ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const;

const recordsLabels = [
  '기록',
  '기록을 불러오는 중입니다…',
  '보관된 사주 기록',
  '기록 확인 중…',
  '아직 저장된 사주 풀이가 없습니다.',
  '완료된 사주 풀이가 저장되면 이곳에서 풀이 이력을 확인할 수 있습니다.',
  '다른 사주 주제 둘러보기',
  '저장된 풀이 열기 →',
  '사주 페이지에서 보기 →',
  '완료',
  '저장된 사주 보고서를 지금 확인할 수 없습니다.',
  '조회가 실패한 상태이며, 기록이 없다는 뜻은 아닙니다. 나중에 다시 확인해 주세요.',
  '계정 또는 세션이 변경되었습니다. 현재 계정의 기록을 보려면 새로고침해 주세요.',
  '기록을 확인하려면 현재 세션이 필요합니다. 로그인하거나 게스트 세션을 다시 연결한 뒤 확인해 주세요.',
  '현재 기록을 불러올 수 없습니다. 잠시 뒤 다시 확인해 주세요.',
] as const;

describe('Records unified locale and profile-free surface', () => {
  it('translates every fixed archive label through the same four-language path', () => {
    for (const label of recordsLabels) {
      for (const locale of locales) {
        const translated = translateStaticUi(label, locale);
        expect(translated, `${locale}: ${label}`).not.toBe(label);
        expect(translated, `${locale}: ${label}`).not.toMatch(/[가-힣]/u);
      }
      expect(translateStaticUi(label, 'ko-KR')).toBe(label);
    }
  });

  it('starts the same pre-paint locale boundary for all four non-Korean languages', () => {
    const boot = read('ui-i18n-boot.js');
    for (const locale of locales) expect(boot).toContain(locale);
    expect(boot).toContain("document.documentElement.dataset.uiPending = 'true'");
    expect(boot).toContain("document.addEventListener('myeongha:ui-ready'");
  });

  it('removes the entire preferred-name strip without relaxing record authority boundaries', () => {
    const jsx = read('src/records/RecordsPage.tsx');
    const page = read('records-page.js');
    const css = read('records-v2.css');
    expect(jsx).not.toContain('records-profile-strip');
    expect(jsx).not.toContain('records-display-name');
    expect(jsx).not.toContain('records-subject-kind');
    expect(page).not.toContain('renderProfile(');
    expect(page).not.toContain('records-display-name');
    expect(css).not.toContain('records-profile-');
    expect(page).toContain('captureRecordsOwner(');
    expect(page).toContain('isRecordsOwnerCurrent(');
    expect(page).toContain('renderSajuReadings(records.readings);');
  });

  it('does not translate user-authored data or saved official interpretations', () => {
    const privateText = '사용자가 직접 입력한 기록 123';
    for (const locale of locales) {
      expect(translateStaticUi(privateText, locale)).toBe(privateText);
    }
    expect(read('ui-i18n.js')).toContain('[data-official-reading]');
    expect(read('ui-i18n.js')).toContain('[data-chat-body-source]');
  });
});

