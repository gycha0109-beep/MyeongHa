import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const landing = readFileSync(new URL('../apps/web/src/landing/LandingPage.tsx', import.meta.url), 'utf8');
const chat = readFileSync(new URL('../apps/web/src/chat/ChatPage.tsx', import.meta.url), 'utf8');

describe('LEGAL L5: visible generative-AI disclosures', () => {
  it('states the AI-based nature before the public entry action', () => {
    const notice = landing.match(/<p\s+className="landing-description"\s+data-legal-ai-prior-notice>([\s\S]*?)<\/p>/u);
    expect(notice).not.toBeNull();
    expect(notice?.[1]).toContain('생성형 인공지능');
    expect(notice?.[1]).toContain('실제 사람이 아니며');
    expect(landing.indexOf('data-legal-ai-prior-notice')).toBeLessThan(landing.indexOf('className="landing-actions"'));
  });

  it('labels character replies on the conversation screen before message submission', () => {
    const notice = chat.match(/<p\s+className="character-ai-disclosure"\s+data-legal-ai-generation-label>([\s\S]*?)<\/p>/u);
    expect(notice).not.toBeNull();
    expect(notice?.[1]).toContain('생성형 AI가 작성');
    expect(notice?.[1]).toContain('사실과 다를 수');
    expect(chat.indexOf('data-legal-ai-generation-label')).toBeLessThan(chat.indexOf('data-composer'));
  });

  it('localizes both legal notices in Japanese and Traditional Chinese', async () => {
    const { translateStaticUi } = await import('../apps/web/ui-i18n.js');
    const notices = [
      '명하의 캐릭터 대화는 생성형 인공지능을 이용합니다. 캐릭터는 실제 사람이 아니며, 대화 답변은 AI가 생성합니다.',
      '이 대화의 캐릭터 답변은 생성형 AI가 작성합니다. 캐릭터는 실제 사람이 아니며, 답변은 사실과 다를 수 있습니다.',
    ];
    for (const source of notices) {
      for (const locale of ['ja-JP', 'zh-TW']) {
        const translated = translateStaticUi(source, locale);
        expect(translated).not.toBe(source);
        expect(translated).not.toMatch(/[가-힣]/u);
      }
    }
  });
});
