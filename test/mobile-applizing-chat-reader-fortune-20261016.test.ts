import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { MOBILE_CHAT_LAUNCH_ROSTER_V1, MOBILE_CHAT_PENDING_ROSTER_V1 } from '../apps/mobile/src/features/chat/chat-launch-roster.js';
import { FORTUNE_COOKIE_MESSAGES_V1 as webMessages, pickFortuneCookieIndexV1 as webPick } from '../apps/web/src/home/fortune-cookie.js';
import { FORTUNE_COOKIE_MESSAGES_V1 as mobileMessages, pickFortuneCookieIndexV1 as mobilePick } from '../apps/mobile/src/features/home/mobile-fortune-cookie.js';

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile chat + Reader portrait + Fortune Cookie parity', () => {
  it('keeps six chat launch characters and shows three inactive entries at the bottom', async () => {
    expect(MOBILE_CHAT_LAUNCH_ROSTER_V1.map(x => x.characterId)).toEqual([
      'seyeon', 'yeoul', 'rahyeon', 'taegyeom', 'yunho', 'baekheon',
    ]);
    expect(MOBILE_CHAT_PENDING_ROSTER_V1.map(x => x.characterId)).toEqual([
      'doyun', 'seorin', 'mira',
    ]);
    const hub = await source('apps/mobile/src/app/(tabs)/chat/index.tsx');
    expect(hub).toContain('MOBILE_CHAT_PENDING_ROSTER_V1.map');
    expect(hub).toContain('연결자 등록 중');
    expect(hub).toContain('disabled={disabled}');
    expect(hub).toContain('style={styles.cardMain}');
    expect(hub).toContain('style={styles.characterPortrait}');
    expect(hub).toContain('numberOfLines={2}');
    expect(hub).toContain('AI 답변 준비 중 · 기록 열람 가능');
    expect(hub).not.toContain('characterTags.map');
    expect(hub).not.toContain('onPress={() => void handleOpen(character.characterId)}' + '\\n' + '              style={styles.pendingRow}');
  });

  it('uses the same bundled portrait resolver for expanded and collapsed Reader selection on Face and Saju', async () => {
    const picker = await source('apps/mobile/src/features/reading/MobileReaderPicker.tsx');
    const face = await source('apps/mobile/src/app/(tabs)/reading/face.tsx');
    const saju = await source('apps/mobile/src/app/(tabs)/reading/index.tsx');
    expect(picker).toContain('resolveMobileChatPortraitV1(effectiveSelected)');
    expect(picker).toContain('resolveMobileChatPortraitV1(option.key)');
    expect(picker).toContain('style={styles.selectedPortrait}');
    expect(picker).toContain('style={styles.optionPortrait}');
    expect(face).toContain('<MobileReaderPicker');
    expect(saju).toContain('<MobileReaderPicker');
  });

  it('keeps Web and Android fortune-cookie messages byte-for-byte identical and nonrepeating', async () => {
    expect(mobileMessages).toEqual(webMessages);
    expect(mobileMessages.length).toBeGreaterThanOrEqual(50);
    const previous = 5;
    for (const value of [0, 0.1, 0.5, 0.9999]) {
      expect(mobilePick(previous, () => value)).toBe(webPick(previous, () => value));
      expect(mobilePick(previous, () => value)).not.toBe(previous);
    }
    const home = await source('apps/mobile/src/app/(tabs)/index.tsx');
    const cookie = await source('apps/mobile/src/features/home/MobileFortuneCookie.tsx');
    expect(home).toContain('<MobileFortuneCookie />');
    expect(cookie).toContain('오늘의 쪽지');
    expect(cookie).toContain('function openNote()');
    expect(cookie).toContain('if (index === -1)');
    expect(cookie).not.toContain('다른 쪽지 뽑기');
    expect(cookie).not.toContain('재미로 보는');
    expect(cookie).not.toContain('재미로 읽는');
    expect(cookie).not.toContain('개인 사주 풀이가 아닙니다');
  });

  it('never downgrades chat room read credentials from Member to Guest and shows a safe retry code', async () => {
    const open = await source('apps/mobile/src/features/chat/mobile-chat-open-service.ts');
    const nativeRead = await source('apps/mobile/src/features/chat/native-mobile-chat-read-service.ts');
    const read = await source('apps/mobile/src/features/chat/mobile-chat-read-service.ts');
    const repo = await source('apps/mobile/src/features/chat/mobile-chat-read-repository.ts');
    const ui = await source('apps/mobile/src/features/chat/ChatReadComponents.tsx');
    const room = await source('apps/mobile/src/app/(tabs)/chat/[threadId].tsx');
    expect(open).toContain('withMemberBearer');
    expect(nativeRead).toContain('session: nativeMobileRuntimeV1.memberSession');
    expect(read).toContain('withMemberBearer');
    expect(read).not.toContain('withActiveBearer');
    expect(repo).toContain('CHAT_MEMBER_SESSION_REQUIRED');
    expect(ui).toContain("t('오류 코드')");
    expect(ui).toContain('{snapshot.errorCode}');
    expect(ui).toContain('대화 다시 불러오기');
    expect(room).toContain('onRetry={() => void refresh()}');
  });
});
