import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  PLANNED_PROTECTED_UI_LOCALES_V1,
  projectPlannedProtectedUiV1,
} from '../apps/mobile/src/ui/mobile-planned-protected-shell-v1.js';
import { normalizeMobileUiLocale } from '../apps/mobile/src/ui/mobile-ui-copy.js';
import { projectMobileChatHistoryShellV1 } from '../apps/mobile/src/features/chat/mobile-chat-history-shell-locale-v1.js';
import { projectMobileChatComposeUiV1 } from '../apps/mobile/src/features/chat/mobile-chat-compose-ui-locale-v1.js';
import { projectMobileOfficialReaderEntryUiV1 } from '../apps/mobile/src/features/reading/mobile-official-reader-entry-locale-v1.js';
import { projectMobileSourceLanguageNoticeV1 } from '../apps/mobile/src/ui/mobile-source-language-notice-v1.js';

const source = (path: string) => readFile(new URL('../' + path, import.meta.url), 'utf8');

const REQUIRED_CHAT_KEYS = [
  'loading', 'holdTitle', 'holdDescription', 'holdComposerTitle',
  'holdComposerDescription', 'errorTitle', 'errorDescription', 'errorCodeLabel',
  'empty', 'retry', 'end', 'next', 'profile',
  'headerUnknownParticipant', 'headerVerifiedRoom', 'headerHistoryLabel', 'headerPortrait',
] as const;
const REQUIRED_COMPOSER_KEYS = [
  'checkingCharacter', 'waitingForHistory', 'characterNotReady',
  'retryRoom', 'nonSeyeonNotice', 'placeholder',
] as const;
const REQUIRED_READER_KEYS = [
  'eyebrow', 'title', 'description', 'viewIntroduction',
  'viewIntroductionHint', 'preview', 'conceptPending', 'selectionBoundary',
  'statusTitle', 'sourceNotice', 'disabledLabel',
  'disabledAccessibilityLabel', 'authorityBoundary',
] as const;
const REQUIRED_READER_STATUSES = [
  'public_route_off', 'server_verification_required', 'product_unsupported',
  'purchase_access_required', 'release_approval_pending',
  'release_temporarily_unavailable', 'official_reading_access_denied',
  'retryable_verification_failure', 'protected_verification_failure',
  'server_admission_required',
] as const;

describe('I18N-07 EN-US and ZH-CN staged protected interface shells', () => {
  it('authors complete Chat history, composer, original text and Reader closed-state UI in both targets', () => {
    expect(PLANNED_PROTECTED_UI_LOCALES_V1).toEqual(['en-US', 'zh-CN']);
    for (const locale of PLANNED_PROTECTED_UI_LOCALES_V1) {
      const ui = projectPlannedProtectedUiV1(locale);
      expect(ui).not.toBeNull();
      if (ui === null) throw new Error('Missing planned UI');
      expect(ui.uiLocale).toBe(locale);
      expect(Object.keys(ui.chat).sort()).toEqual([...REQUIRED_CHAT_KEYS].sort());
      expect(Object.keys(ui.composer).sort()).toEqual([...REQUIRED_COMPOSER_KEYS].sort());
      expect(Object.keys(ui.reader.statusMessages).sort()).toEqual([...REQUIRED_READER_STATUSES].sort());
      for (const key of REQUIRED_READER_KEYS) {
        expect(ui.reader[key].trim().length).toBeGreaterThan(0);
      }
      // The Reader's nested statusMessages object is checked separately.
      // Do not replace it with an empty-string sentinel: that creates a false
      // missing-translation error rather than checking authored Reader text.
      const { statusMessages, ...readerCopy } = ui.reader;
      for (const [name, collection] of Object.entries({
        chat: ui.chat,
        composer: ui.composer,
        originalTextNotices: ui.originalTextNotices,
        reader: readerCopy,
        readerStatuses: statusMessages,
      })) {
        for (const [key, value] of Object.entries(collection)) {
          expect(value.trim().length, `${locale}:${name}:${key}`).toBeGreaterThan(0);
          expect(value, `${locale}:${name}:${key}`).not.toMatch(/[가-힣]/u);
        }
      }
      expect(Object.keys(ui.originalTextNotices).sort()).toEqual(['chat', 'reading']);
      expect(ui.originalTextNotices.chat).toMatch(/original language|原文/u);
      expect(ui.originalTextNotices.reading).toMatch(/original|原文/u);
      expect(Object.isFrozen(ui)).toBe(true);
      expect(Object.isFrozen(ui.chat)).toBe(true);
      expect(Object.isFrozen(ui.composer)).toBe(true);
      expect(Object.isFrozen(ui.originalTextNotices)).toBe(true);
      expect(Object.isFrozen(ui.reader.statusMessages)).toBe(true);
    }
  });

  it('does not imply that retry or app reinstall releases privacy HOLD, or that UI grants Reader access', () => {
    const en = projectPlannedProtectedUiV1('en-US');
    const cn = projectPlannedProtectedUiV1('zh-CN');
    if (en === null || cn === null) throw new Error('Missing protected UI');
    expect(en.chat.holdDescription).toContain('Reloading repeatedly will not lift');
    expect(en.chat.holdComposerDescription).toContain('Reinstalling the app will not remove');
    expect(cn.chat.holdDescription).toContain('重复加载不会解除');
    expect(cn.chat.holdComposerDescription).toContain('重新安装应用也不会解除');
    expect(en.reader.selectionBoundary).toContain('does not create purchase access');
    expect(cn.reader.selectionBoundary).toContain('不会创建购买权限');
    for (const locale of PLANNED_PROTECTED_UI_LOCALES_V1) {
      const ui = projectPlannedProtectedUiV1(locale);
      if (ui === null) throw new Error('Missing protected UI');
      expect(ui.activeUiLocaleAdmitted).toBe(false);
      expect(ui.sourceTextTranslated).toBe(false);
      expect(ui.chatMessageTranslated).toBe(false);
      expect(ui.chatSendAllowedByLocale).toBe(false);
      expect(ui.privacyHoldBypassed).toBe(false);
      expect(ui.readerOutputLocalized).toBe(false);
      expect(ui.interpretationReleased).toBe(false);
      expect(ui.reader.statusMessages.protected_verification_failure).toBeTruthy();
      expect(ui.reader.statusMessages.server_admission_required).toBeTruthy();
      expect(ui).not.toHaveProperty('threadId');
      expect(ui).not.toHaveProperty('readingId');
      expect(ui).not.toHaveProperty('entitlement');
    }
    for (const locale of ['ko-KR', 'ja-JP', 'zh-TW', 'zh-Hans', 'zh', 'en', 'en-GB', null, undefined, 'EN-US']) {
      expect(projectPlannedProtectedUiV1(locale)).toBeNull();
    }
  });

  it('keeps unapproved locales closed in production projectors and never translates Chat/Official data', async () => {
    const [mobile, chat, composer, reader, notice] = await Promise.all([
      source('apps/mobile/src/ui/mobile-ui-copy.ts'),
      source('apps/mobile/src/features/chat/ChatReadComponents.tsx'),
      source('apps/mobile/src/features/chat/mobile-chat-compose-ui-locale-v1.ts'),
      source('apps/mobile/src/features/reading/mobile-official-reader-entry-locale-v1.ts'),
      source('apps/mobile/src/ui/mobile-source-language-notice-v1.ts'),
    ]);
    for (const locale of PLANNED_PROTECTED_UI_LOCALES_V1) {
      expect(normalizeMobileUiLocale(locale)).toBe(locale);
      expect(projectMobileChatHistoryShellV1(locale)).toEqual(projectMobileChatHistoryShellV1('ko-KR'));
      expect(projectMobileChatComposeUiV1(locale, 'waiting_history')).toEqual(projectMobileChatComposeUiV1('ko-KR', 'waiting_history'));
      expect(projectMobileOfficialReaderEntryUiV1(locale, 'public_route_off')).toEqual(projectMobileOfficialReaderEntryUiV1('ko-KR', 'public_route_off'));
      expect(projectMobileSourceLanguageNoticeV1(locale, 'chat')).toEqual(projectMobileSourceLanguageNoticeV1('ko-KR', 'chat'));
    }
    for (const activeSource of [mobile, chat, composer, reader, notice]) {
      expect(activeSource).not.toContain('projectPlannedProtectedUiV1(');
    }
    expect(chat).toContain('isSeyeonHistoryRevealHoldV1(snapshot)');
    expect(chat).toContain('const allowed = ready && seyeon;');
    expect(chat).toContain('{message.body}');
    expect(chat).toContain('{greeting.openingLine}');
    expect(reader).toContain('readerOutputLocalized: false');
  });
});
