import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  localizeMobileChatHubErrorV1,
  MOBILE_CHAT_HUB_AUTHORED_ERROR_KEYS_V1,
} from '../apps/mobile/src/features/chat/mobile-chat-hub-error-copy.js';

describe('Chat Hub authored error text in five UI languages', () => {
  it('localizes all seven canonical local errors and preserves unknown text', () => {
    expect(MOBILE_CHAT_HUB_AUTHORED_ERROR_KEYS_V1).toHaveLength(7);
    expect(new Set(MOBILE_CHAT_HUB_AUTHORED_ERROR_KEYS_V1).size).toBe(7);
    for (const source of MOBILE_CHAT_HUB_AUTHORED_ERROR_KEYS_V1) {
      expect(localizeMobileChatHubErrorV1(source, 'ko-KR')).toBe(source);
      for (const locale of ['ja-JP','zh-TW','en-US','zh-CN'] as const) {
        const rendered = localizeMobileChatHubErrorV1(source, locale);
        expect(rendered, `${source} in ${locale}`).not.toBe(source);
        expect(rendered).not.toMatch(/[가-힣]/u);
      }
    }
    for (const locale of ['ko-KR','ja-JP','zh-TW','en-US','zh-CN'] as const) {
      expect(localizeMobileChatHubErrorV1('사용자 메시지: 비공개 이야기', locale))
        .toBe('사용자 메시지: 비공개 이야기');
      expect(localizeMobileChatHubErrorV1('CHAT_SERVER_UNKNOWN_CODE', locale))
        .toBe('CHAT_SERVER_UNKNOWN_CODE');
      expect(localizeMobileChatHubErrorV1('', locale)).toBe('');
    }
  });

  it('renders locale-aware authored Hub failure state only, without changing session authority', async () => {
    const [hub, access] = await Promise.all([
      readFile(new URL('../apps/mobile/src/app/(tabs)/chat/index.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/chat/use-mobile-chat-open.tsx', import.meta.url), 'utf8'),
    ]);
    expect(hub).toContain("const { t, locale } = useMobileUiLocale()");
    expect(hub.split("localizeMobileChatHubErrorV1(state.errorMessage ?? '', locale)").length - 1).toBe(2);
    expect(hub).toContain("const canOpen = state.access === 'member'");
    expect(hub).toContain('disabled={disabled}');
    expect(hub).not.toContain("t(state.errorMessage)");
    for (const source of MOBILE_CHAT_HUB_AUTHORED_ERROR_KEYS_V1) {
      expect(access, `missing canonical source ${source}`).toContain(source);
    }
    expect(access).toContain('nativeMobileRuntimeV1.memberSession.read()');
    expect(access).toContain('mobileChatOpenServiceV1.open(characterId)');
  });
});
