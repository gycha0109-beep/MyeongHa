import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { translateStaticUi } from '../apps/web/ui-i18n.js';
import { resolveCharacterDisplayNameV1 } from '../apps/web/character-display-locale.js';

const root = resolve(process.cwd(), 'apps/web');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
const locales = ['ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const;

describe('Live Chat bubbles use all four UI locales', () => {
  it('translates pending messages, typing, wait states and privacy/availability statuses', () => {
    const sources = [
      '전송 중인 메시지',
      '세연의 답장을 기다리는 중',
      '답장하는 중',
      '세연이 답하고 있습니다…',
      '세연의 답변이 도착했습니다.',
      '이전 대화 기록은 서버의 개인정보 보호 조치로 표시할 수 없습니다.',
      '이전 대화 기록은 개인정보 보호를 위해 표시하지 않습니다. 새 AI 답변은 아직 준비 중입니다.',
      '현재 세연의 AI 메시지 전송은 운영 준비 중입니다. 크레딧 예약·정산 연결이 완료되지 않아 전송할 수 없으며, 입력한 내용은 보존했습니다.',
    ];
    for (const source of sources) {
      for (const locale of locales) {
        expect(translateStaticUi(source, locale), `${locale} ${source}`).not.toBe(source);
        expect(translateStaticUi(source, locale), `${locale} ${source}`).not.toMatch(/[가-힣]/u);
      }
      expect(translateStaticUi(source, 'ko-KR')).toBe(source);
    }
  });

  it('shares the same canonical character display name with the normal chat bubbles', () => {
    for (const locale of locales) {
      const name = resolveCharacterDisplayNameV1('seyeon', locale);
      expect(name).toBeTruthy();
      expect(name).not.toMatch(/[가-힣]/u);
    }
    const runtime = read('chat-runtime-client.js');
    const live = read('chat-live-turn.js');
    expect(runtime).toContain('labels: liveTurnLabels()');
    expect(runtime).toContain('repaintPendingChatLiveTurnV1(chatStream, liveTurnLabels())');
    expect(runtime).toContain('characterAvatar: liveTurnLabels().characterAvatar');
    expect(runtime).toContain('paragraph.textContent = message.bodyText;');
    expect(live).toContain('userContent.textContent = input.message');
    expect(live).toContain('typing.textContent = labels.typingText');
    expect(live).toContain('if (dots) typing.append(dots)');
    expect(live).not.toContain('userContent.innerHTML');
    expect(live).not.toContain('assistantText = translateStaticUi');
  });
});

