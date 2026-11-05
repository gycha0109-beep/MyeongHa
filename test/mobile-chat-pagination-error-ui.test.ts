import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  isMobileChatContinuationReadFailureV1,
  mobileChatContinuationErrorCopyV1,
} from '../apps/mobile/src/features/chat/mobile-chat-pagination-error-ui.js';

describe('mobile Chat continuation failure UI', () => {
  it('discloses incomplete retained history, never mislabels access denial or finished history', () => {
    const retained = { status: 'error' as const, hasMore: true, messages: [{}] };
    expect(isMobileChatContinuationReadFailureV1(retained)).toBe(true);
    expect(isMobileChatContinuationReadFailureV1({ ...retained, messages: [] })).toBe(false);
    expect(isMobileChatContinuationReadFailureV1({ ...retained, status: 'ready' })).toBe(false);
    expect(isMobileChatContinuationReadFailureV1({ ...retained, status: 'loading_more' })).toBe(false);
    expect(isMobileChatContinuationReadFailureV1({ ...retained, hasMore: false })).toBe(false);
    // Server authorization and protocol failures clear the retained transcript.
    expect(isMobileChatContinuationReadFailureV1({ status: 'error', hasMore: false, messages: [] })).toBe(false);
  });

  it('shows a correctly localized static retry notice in five languages', () => {
    const korean = mobileChatContinuationErrorCopyV1('ko-KR');
    expect(korean).toContain('이미 표시한 메시지는 유지됩니다.');
    for (const locale of ['ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const) {
      const copy = mobileChatContinuationErrorCopyV1(locale);
      expect(copy).not.toBe(korean);
      expect(copy).not.toMatch(/[가-힣]/u);
      expect(copy.length).toBeGreaterThan(10);
    }
  });

  it('preserves existing committed messages and authority holds before offering the same cursor retry', async () => {
    const [ui, repository] = await Promise.all([
      readFile(new URL('../apps/mobile/src/features/chat/ChatReadComponents.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/chat/mobile-chat-read-repository.ts', import.meta.url), 'utf8'),
    ]);
    const readMore = ui.slice(ui.indexOf('export function ChatReadMore({'), ui.indexOf('export function ChatComposer({'));
    expect(readMore).toContain('if (isSeyeonHistoryRevealHoldV1(snapshot)) return null;');
    expect(readMore).toContain("if (snapshot.status === 'error' && snapshot.messages.length === 0)");
    expect(readMore.indexOf('isMobileChatContinuationReadFailureV1(snapshot)'))
      .toBeLessThan(readMore.indexOf('if (!snapshot.hasMore)'));
    expect(readMore).toContain('mobileChatContinuationErrorCopyV1(locale)');
    expect(readMore).toContain('onPress={onLoadMore}');
    expect(readMore).toContain("t('오류 코드')");
    expect(ui).toContain('{message.body}');
    expect(repository).toContain('invalidatesCurrentReadAuthority(error, errorCode)');
    expect(repository).toContain('publish({ ...snapshot, status: \'error\', errorCode });');
  });
});
