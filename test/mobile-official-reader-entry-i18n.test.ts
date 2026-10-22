import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { projectMobileOfficialReaderEntryUiV1 } from '../apps/mobile/src/features/reading/mobile-official-reader-entry-locale-v1.js';
import { projectMobileOfficialReadingReaderEntryV1 } from '../apps/mobile/src/features/reading/mobile-official-reading-reader-entry-view-model.js';
import { MOBILE_READER_PRESENTATIONS_V1 } from '../apps/mobile/src/features/reading/mobile-reader-presentation.js';
import type { MobileOfficialReadingReaderEntryStatusV1 } from '../apps/mobile/src/features/reading/mobile-official-reading-reader-entry-view-model.js';

const official = Object.freeze({ readingId: '11111111-1111-4111-8111-111111111111' });
const STATUSES: readonly MobileOfficialReadingReaderEntryStatusV1[] = [
  'public_route_off',
  'server_verification_required',
  'product_unsupported',
  'purchase_access_required',
  'release_approval_pending',
  'release_temporarily_unavailable',
  'official_reading_access_denied',
  'retryable_verification_failure',
  'protected_verification_failure',
  'server_admission_required',
];

describe('I18N-07 Official Reading Reader introductions: UI text only', () => {
  it('renders all ten blocked-entry reasons in three UI languages without releasing interpretation', () => {
    for (const status of STATUSES) {
      const ko = projectMobileOfficialReaderEntryUiV1('ko-KR', status);
      const ja = projectMobileOfficialReaderEntryUiV1('ja-JP', status);
      const zh = projectMobileOfficialReaderEntryUiV1('zh-TW', status);
      for (const ui of [ko, ja, zh]) {
        expect(ui.statusMessage.length).toBeGreaterThan(8);
        expect(ui.interpretationReleased).toBe(false);
        expect(ui.readerOutputLocalized).toBe(false);
        expect(ui.authorityBoundary.length).toBeGreaterThan(30);
        expect(ui.selectionBoundary.length).toBeGreaterThan(20);
        expect(Object.isFrozen(ui)).toBe(true);
        expect(ui).not.toHaveProperty('readerLocale');
        expect(ui).not.toHaveProperty('readingLocale');
        expect(ui).not.toHaveProperty('canStartInterpretation');
      }
      expect(ja.statusMessage).not.toBe(ko.statusMessage);
      expect(zh.statusMessage).not.toBe(ko.statusMessage);
    }
    expect(projectMobileOfficialReaderEntryUiV1('ko-KR', 'public_route_off').statusMessage)
      .toBe('공식 Reader 해설은 아직 공개되지 않았습니다.');
  });

  it('never silently admits unsupported UI languages or unexpected status messages', () => {
    const ko = projectMobileOfficialReaderEntryUiV1('ko-KR', 'public_route_off');
    for (const unsupported of ['ja', 'zh-CN', 'en-US', '', undefined]) {
      expect(projectMobileOfficialReaderEntryUiV1(unsupported, 'public_route_off')).toEqual(ko);
    }
    const unknown = projectMobileOfficialReaderEntryUiV1('ja-JP',
      'unsupported_untrusted_server_value' as MobileOfficialReadingReaderEntryStatusV1);
    expect(unknown.statusMessage).toBe(
      projectMobileOfficialReaderEntryUiV1('ja-JP', 'protected_verification_failure').statusMessage,
    );
    expect(unknown.interpretationReleased).toBe(false);
  });

  it('keeps the nine Reader IDs and the actual server-owned archive source separate from locale', () => {
    for (const reader of MOBILE_READER_PRESENTATIONS_V1) {
      const entry = projectMobileOfficialReadingReaderEntryV1(official, reader.key);
      expect(entry.officialReadingId).toBe(official.readingId);
      expect(entry.readerId).toBe(reader.key);
      expect(entry.status).toBe('public_route_off');
      expect(entry.canStartInterpretation).toBe(false);
      expect(entry).not.toHaveProperty('threadId');
      for (const locale of ['ko-KR', 'ja-JP', 'zh-TW'] as const) {
        const ui = projectMobileOfficialReaderEntryUiV1(locale, entry.status);
        expect(ui.statusMessage.length).toBeGreaterThan(8);
        expect(entry.readerId).toBe(reader.key);
        expect(entry.canStartInterpretation).toBe(false);
      }
    }
  });

  it('wires only authored archive labels, keeping original character voice copy and blocking Thread entry', async () => {
    const [view, screen, copy] = await Promise.all([
      readFile(new URL('../apps/mobile/src/features/reading/MobileOfficialReadingReaderEntry.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/app/reading/[readingId].tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/reading/mobile-official-reader-entry-locale-v1.ts', import.meta.url), 'utf8'),
    ]);
    expect(screen).toContain('<MobileOfficialReadingReaderEntry record={state.record} />');
    expect(view).toContain('projectMobileOfficialReadingReaderEntryV1(record, selectedReaderId)');
    expect(view).toContain('projectMobileOfficialReaderEntryUiV1(locale, entry.status)');
    expect(view).toContain('{ui.statusMessage}');
    expect(view).toContain('{ui.authorityBoundary}');
    expect(view).toContain('{ui.disabledLabel}');
    expect(view).toContain('accessibilityLabel={ui.disabledAccessibilityLabel}');
    expect(view).toContain('{selectedReader.tone}');
    expect(view).toContain('{reader.title}');
    expect(view).toContain('MOBILE_READER_PRESENTATIONS_V1.map');
    expect(view).not.toContain('router.push(');
    expect(view).not.toContain('openCharacter(');
    expect(view).not.toContain('fetch(');
    expect(view).not.toContain('mobileReaderInterpretationServiceV1');
    expect(copy).toContain('readerOutputLocalized: false as const');
    expect(copy).toContain('interpretationReleased: false as const');
  });
});
