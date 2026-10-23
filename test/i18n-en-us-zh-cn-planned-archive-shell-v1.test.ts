import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  PLANNED_ARCHIVE_LOCALES_V1,
  projectPlannedOfficialArchiveUiV1,
  projectPlannedArchiveFailureV1,
} from '../apps/mobile/src/ui/mobile-planned-official-archive-shell-v1.js';
import {
  projectMobileOfficialReadingShellV1,
  officialReadingArchiveFailureCopyV1,
} from '../apps/mobile/src/ui/mobile-official-reading-shell-locale-v1.js';

const source = (path: string) => readFile(new URL('../' + path, import.meta.url), 'utf8');

const FIXED_KEYS = [
  'back', 'loading', 'retry', 'original', 'readerHeading', 'noReader',
  'readerBoundary', 'noticesTitle', 'stepPrefix',
  'structureTitle', 'supportingTitle',
] as const;
const KNOWN_FAILURES = [
  '로그인 상태가 변경되어 이전 계정의 공식 풀이를 표시하지 않았습니다.',
  '현재 기록에서 이 저장된 풀이를 찾을 수 없습니다.',
  '저장된 공식 풀이를 안전하게 표시할 수 없습니다.',
  '저장된 풀이를 불러오지 못했습니다.',
] as const;

describe('I18N-07 EN-US/ZH-CN staged Official Reading archive UI only', () => {
  it('authors all existing archive shell fields and count labels without rewriting the saved source', () => {
    expect(PLANNED_ARCHIVE_LOCALES_V1).toEqual(['en-US', 'zh-CN']);
    for (const locale of PLANNED_ARCHIVE_LOCALES_V1) {
      const ui = projectPlannedOfficialArchiveUiV1(locale);
      if (ui === null) throw new Error('Missing planned archive UI');
      expect(ui.uiLocale).toBe(locale);
      for (const key of FIXED_KEYS) {
        expect(ui[key].trim().length).toBeGreaterThan(0);
        expect(ui[key]).not.toMatch(/[가-힣]/u);
      }
      for (const count of [0, 1, 2, 9]) {
        expect(ui.readerCount(count).trim().length).toBeGreaterThan(0);
        expect(ui.readerLabel(count).trim().length).toBeGreaterThan(0);
        expect(ui.readerCount(count)).not.toMatch(/[가-힣]/u);
        expect(ui.readerLabel(count)).not.toMatch(/[가-힣]/u);
      }
      expect(ui.activeUiLocaleAdmitted).toBe(false);
      expect(ui.storedReadingTranslated).toBe(false);
      expect(ui.archivedSourceMutated).toBe(false);
      expect(ui.readerAccessGranted).toBe(false);
      expect(ui.readingReissued).toBe(false);
      expect(Object.isFrozen(ui)).toBe(true);
      expect(ui).not.toHaveProperty('readingRef');
      expect(ui).not.toHaveProperty('officialArtifactResponseHash');
      expect(ui).not.toHaveProperty('sourceSemanticHash');
    }
  });

  it('accepts only known UI errors and protects unknown failure content with a generic failure', () => {
    for (const locale of PLANNED_ARCHIVE_LOCALES_V1) {
      for (const message of KNOWN_FAILURES) {
        const copy = projectPlannedArchiveFailureV1(message, locale);
        expect(copy).not.toBeNull();
        expect(copy).not.toMatch(/[가-힣]/u);
      }
      const generic = projectPlannedArchiveFailureV1(KNOWN_FAILURES[3], locale);
      expect(projectPlannedArchiveFailureV1(null, locale)).toBe(generic);
      expect(projectPlannedArchiveFailureV1('PRIVATE_USER_READING_RAW_PAYLOAD', locale)).toBe(generic);
      expect(projectPlannedArchiveFailureV1('세연 개인 비공개 내용', locale)).toBe(generic);
    }
    for (const value of ['en', 'zh', 'zh-Hans', 'ja-JP', 'ko-KR', undefined, null]) {
      expect(projectPlannedOfficialArchiveUiV1(value)).toBeNull();
      expect(projectPlannedArchiveFailureV1(KNOWN_FAILURES[0], value)).toBeNull();
    }
  });

  it('cannot activate an English or Simplified Chinese Official Reading through the active archive projector', async () => {
    const [actualSource, actualScreen, plannedSource] = await Promise.all([
      source('apps/mobile/src/ui/mobile-official-reading-shell-locale-v1.ts'),
      source('apps/mobile/src/app/reading/[readingId].tsx'),
      source('apps/mobile/src/ui/mobile-planned-official-archive-shell-v1.ts'),
    ]);
    for (const locale of PLANNED_ARCHIVE_LOCALES_V1) {
      expect(projectMobileOfficialReadingShellV1(locale)).toEqual(projectMobileOfficialReadingShellV1('ko-KR'));
      expect(officialReadingArchiveFailureCopyV1(KNOWN_FAILURES[0], locale))
        .toBe(officialReadingArchiveFailureCopyV1(KNOWN_FAILURES[0], 'ko-KR'));
    }
    expect(actualSource).not.toContain('projectPlannedOfficialArchiveUiV1');
    expect(actualScreen).not.toContain('projectPlannedOfficialArchiveUiV1');
    expect(actualScreen).toContain('{step.primary}');
    expect(actualScreen).toContain('projectMobileOfficialReadingShellV1(locale)');
    expect(plannedSource).not.toContain('fetch(');
    expect(plannedSource).not.toContain('responseVoiceLocale');
    expect(plannedSource).not.toContain('X-MyeongHa-UI-Locale');
  });
});
