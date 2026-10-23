import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { projectMobileChatHistoryShellV1 } from '../apps/mobile/src/features/chat/mobile-chat-history-shell-locale-v1.js';
import { MOBILE_CHAT_KNOWN_CHARACTERS_V1 } from '../apps/mobile/src/features/chat/chat-launch-roster.js';
import { resolveMobileChatCharacterPresentationV1 } from '../apps/mobile/src/features/chat/chat-character-presentation.js';

describe('I18N-07 mobile verified Chat header UI presentation', () => {
  it('localizes authored header labels without translating identities or title sources', () => {
    const ko = projectMobileChatHistoryShellV1('ko-KR');
    const ja = projectMobileChatHistoryShellV1('ja-JP');
    const zh = projectMobileChatHistoryShellV1('zh-TW');
    expect(ko.headerUnknownParticipant).toBe('대화 상대');
    expect(ko.headerVerifiedRoom).toBe('서버가 확인한 대화방');
    expect(ko.headerHistoryLabel).toBe('대화 기록');
    expect(ko.headerPortrait).toBe('연결자 초상화');
    expect(ja.headerVerifiedRoom).not.toBe(ko.headerVerifiedRoom);
    expect(zh.headerHistoryLabel).not.toBe(ko.headerHistoryLabel);
    for (const ui of [ko, ja, zh]) {
      expect(ui.headerUnknownParticipant.trim().length).toBeGreaterThan(0);
      expect(ui.headerVerifiedRoom.trim().length).toBeGreaterThan(0);
      expect(ui.headerHistoryLabel.trim().length).toBeGreaterThan(0);
      expect(ui.headerPortrait.trim().length).toBeGreaterThan(0);
      expect(ui.translatedMessageBody).toBe(false);
      expect(ui.translatedGreeting).toBe(false);
      expect(ui.privacyHoldBypassed).toBe(false);
      expect(ui.readerOutputLocalized).toBe(false);
    }

    for (const character of MOBILE_CHAT_KNOWN_CHARACTERS_V1) {
      const original = resolveMobileChatCharacterPresentationV1(character.characterId);
      expect(original.title.length).toBeGreaterThan(0);
      expect(original.openingLine.length).toBeGreaterThan(0);
      // Header shell changes may not rewrite canonical persona or names.
      expect(character.displayName.length).toBeGreaterThan(0);
    }
  });

  it('renders UI-only metadata for the verified room while preserving original Character title', async () => {
    const component = await readFile(new URL('../apps/mobile/src/features/chat/ChatReadComponents.tsx', import.meta.url), 'utf8');
    const room = await readFile(new URL('../apps/mobile/src/app/(tabs)/chat/[threadId].tsx', import.meta.url), 'utf8');
    expect(component).toContain('const shell = projectMobileChatHistoryShellV1(locale);');
    expect(component).toContain('character?.displayName ?? shell.headerUnknownParticipant');
    expect(component).toContain('? shell.headerVerifiedRoom');
    expect(component).toContain('${presentation.title} · ${shell.headerHistoryLabel}');
    expect(component).toContain('accessibilityLabel={`${displayName} ${shell.headerPortrait}`}');
    expect(component).toContain('resolveMobileChatCharacterPresentationV1(character.characterId)');
    expect(component).toContain('projectMobileChatEmptyGreetingV1(snapshot)');
    expect(component).toContain('{greeting.openingLine}');
    expect(component).toContain('{message.body}');
    expect(component).toContain('isSeyeonHistoryRevealHoldV1(snapshot)');
    expect(room).toContain('<ChatReadHeader snapshot={snapshot} />');
    expect(room).toContain('projectMobileSourceLanguageNoticeV1(locale,');
    expect(component).not.toContain('t(presentation.title)');
    expect(component).not.toContain('t(greeting.openingLine)');
    expect(component).not.toContain('t(message.body)');
  });
});
