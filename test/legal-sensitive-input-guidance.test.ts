import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const chat = source('apps/web/src/chat/ChatPage.tsx');
const birth = source('apps/web/src/birth/BirthPage.tsx');
const reading = source('apps/web/src/reading/ReadingPage.tsx');

describe('LEGAL L2: sensitive and birth-data collection guidance', () => {
  it('discloses sensitive-data risks before a user submits a character message', () => {
    const marker = chat.indexOf('data-legal-sensitive-chat-guidance');
    expect(marker).toBeGreaterThan(-1);
    expect(marker).toBeLessThan(chat.indexOf('data-composer'));
    expect(chat).toContain('민감한 정보와 타인의 개인정보');
    expect(chat).toContain('AI 답변 생성에 사용될 수 있습니다');
    expect(chat).not.toContain('민감정보는 외부에 전송되지 않습니다');
  });

  it('labels birth data purpose at both persisted profile entry points before submission', () => {
    for (const [page, button] of [
      [birth, 'id="birth-submit-button"'],
      [reading, 'id="saju-create-button"'],
    ] as const) {
      const notice = page.indexOf('data-legal-birth-data-guidance');
      expect(notice).toBeGreaterThan(-1);
      expect(notice).toBeLessThan(page.indexOf(button));
      expect(page).toContain('본인의 출생정보만 입력해 주세요');
      expect(page).toContain('명식 계산에 사용되고 명식록에 저장됩니다');
    }
  });

  it('preserves user options for unknown birth time and unspecified sex', () => {
    expect(birth).toContain('name="timeUnknown"');
    expect(birth).toContain('<option value="">선택하지 않음</option>');
    expect(reading).toContain('id="saju-time-unknown"');
    expect(reading).toContain('<option value="">선택하지 않음</option>');
  });

  it('keeps fixed notices translated in both Web and Mobile locales', async () => {
    const { translateStaticUi } = await import('../apps/web/ui-i18n.js');
    const { translateMobileUiCopy } = await import('../apps/mobile/src/ui/mobile-ui-copy.js');
    const notices = [
      '건강·종교·성생활 등 민감한 정보와 타인의 개인정보는 대화에 입력하지 마세요. 입력된 대화는 AI 답변 생성에 사용될 수 있습니다.',
      '본인의 출생정보만 입력해 주세요. 입력한 출생정보는 명식 계산에 사용되고 명식록에 저장됩니다.',
    ];
    for (const notice of notices) {
      for (const locale of ['ja-JP', 'zh-TW'] as const) {
        const localized = translateStaticUi(notice, locale);
        expect(localized).not.toBe(notice);
        expect(localized).not.toMatch(/[가-힣]/u);
        expect(translateMobileUiCopy(notice, locale)).toBe(localized);
      }
    }
  });
});
