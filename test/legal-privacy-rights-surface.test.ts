import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { translateStaticUi } from '../apps/web/ui-i18n.js';
import { translateMobileUiCopy } from '../apps/mobile/src/ui/mobile-ui-copy.js';

const myPage = readFileSync(new URL('../apps/web/src/my/MyPage.tsx', import.meta.url), 'utf8');

describe('LEGAL L1: truthful personal-data rights information in My settings', () => {
  it('exposes an accessible collapsible panel and actual existing reading destinations', () => {
    expect(myPage).toContain("type SettingsPanel = 'account' | 'privacy' | 'help' | null");
    expect(myPage).toContain('id="my-privacy-panel-trigger"');
    expect(myPage).toContain("aria-expanded={openPanel === 'privacy'}");
    expect(myPage).toContain('aria-controls="my-privacy-panel"');
    expect(myPage).toContain("onClick={() => toggle('privacy')}");
    expect(myPage).toContain('data-legal-privacy-rights-information');
    const beginning = myPage.indexOf('id="my-privacy-panel"');
    const end = myPage.indexOf('id="my-help-panel-trigger"', beginning);
    const panel = myPage.slice(beginning, end);
    expect(panel).toContain("hidden={openPanel !== 'privacy'}");
    expect(panel).toContain('href="birth.html"');
    expect(panel).toContain('href="records.html"');
  });

  it('never confuses informational navigation with accepting a deletion or statutory request', () => {
    const beginning = myPage.indexOf('id="my-privacy-panel"');
    const end = myPage.indexOf('id="my-help-panel-trigger"', beginning);
    const panel = myPage.slice(beginning, end);
    expect(panel).toContain('data-legal-privacy-rights-intake-hold');
    expect(panel).toContain('공식 문의 접수는 아직 연결되지 않았습니다');
    expect(panel).toContain('신청이 접수되거나 정보가 삭제되지는 않습니다');
    expect(panel).not.toMatch(/<form|type="submit"|fetch\(|deleteAccount\(|startAccountDeletion\(/u);
  });

  it('keeps every new fixed notice in sync across Web and Mobile Japanese/Traditional Chinese', () => {
    const authoredCopy = [
      '개인정보 확인 · 권리 안내',
      '현재 확인 가능한 계정·출생 정보와 저장된 기록은 각각의 화면에서 확인할 수 있습니다.',
      '출생 정보 화면으로 이동 →',
      '내 기록 화면으로 이동 →',
      '개인정보 열람·정정·삭제·처리정지 신청과 공식 문의 접수는 아직 연결되지 않았습니다. 이 안내를 여는 것만으로 신청이 접수되거나 정보가 삭제되지는 않습니다.',
    ];
    for (const source of authoredCopy) {
      expect(myPage).toContain(source);
      for (const locale of ['ja-JP', 'zh-TW'] as const) {
        const translated = translateStaticUi(source, locale);
        expect(translated).not.toBe(source);
        expect(translated).not.toMatch(/[가-힣]/u);
        expect(translateMobileUiCopy(source, locale)).toBe(translated);
      }
    }
  });
});
