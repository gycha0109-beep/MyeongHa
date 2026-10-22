import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  officialReadingArchiveFailureCopyV1,
  projectMobileOfficialReadingShellV1,
} from './mobile-official-reading-shell-locale-v1.js';

const artifact = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

describe('I18N-07 authorized subset: mobile archived Official Reading shell', () => {
  it('localizes only authored shell labels across selected ko-KR, ja-JP and zh-TW', () => {
    for (const locale of ['ko-KR', 'ja-JP', 'zh-TW'] as const) {
      const copy = projectMobileOfficialReadingShellV1(locale);
      expect(copy.uiLocale).toBe(locale);
      expect(copy.back.length).toBeGreaterThan(0);
      expect(copy.loading.length).toBeGreaterThan(0);
      expect(copy.readerBoundary.length).toBeGreaterThan(50);
      expect(copy.readerCount(2)).toContain('2');
      expect(copy.readerCount(0)).toContain('0');
      expect(copy.noReader.length).toBeGreaterThan(5);
      expect(copy.stepPrefix.length).toBeGreaterThan(0);
      expect(Object.isFrozen(copy)).toBe(true);
      expect(copy.readerBoundary).toMatch(locale === 'ko-KR' ? /권한/u : locale === 'ja-JP' ? /権限/u : /權限/u);
      expect(copy.original).toMatch(locale === 'ko-KR' ? /그대로/u : locale === 'ja-JP' ? /変更せず/u : /原樣/u);
    }
    expect(projectMobileOfficialReadingShellV1('ja-JP').stepPrefix).toBe('鑑定');
    expect(projectMobileOfficialReadingShellV1('zh-TW').stepPrefix).toBe('解讀');
    expect(projectMobileOfficialReadingShellV1('ko-KR').stepPrefix).toBe('읽기');
  });

  it('fails back to Korean only for unsupported or unchosen UI locales', () => {
    const korean = projectMobileOfficialReadingShellV1('ko-KR');
    for (const locale of ['ja', 'zh-CN', 'en-US', null, undefined]) {
      expect(projectMobileOfficialReadingShellV1(locale).uiLocale).toBe('ko-KR');
      expect(projectMobileOfficialReadingShellV1(locale).original).toBe(korean.original);
    }
  });

  it('localizes only UI-authored failure messages, never arbitrary server or source content', () => {
    const messages = [
      '로그인 상태가 변경되어 이전 계정의 공식 풀이를 표시하지 않았습니다.',
      '현재 기록에서 이 저장된 풀이를 찾을 수 없습니다.',
      '저장된 공식 풀이를 안전하게 표시할 수 없습니다.',
      '저장된 풀이를 불러오지 못했습니다.',
    ] as const;
    for (const msg of messages) {
      expect(officialReadingArchiveFailureCopyV1(msg, 'ko-KR')).toBe(msg);
      expect(officialReadingArchiveFailureCopyV1(msg, 'ja-JP')).not.toBe(msg);
      expect(officialReadingArchiveFailureCopyV1(msg, 'zh-TW')).not.toBe(msg);
    }
    const untrusted = '사용자 기록에서 임의로 읽은 내용';
    expect(officialReadingArchiveFailureCopyV1(untrusted, 'ko-KR')).toBe(
      '저장된 풀이를 불러오지 못했습니다.',
    );
    expect(officialReadingArchiveFailureCopyV1(untrusted, 'zh-TW')).toBe(
      officialReadingArchiveFailureCopyV1(null, 'zh-TW'),
    );
  });

  it('wires actual mobile archived screen shell while leaving source-owned fields verbatim', async () => {
    const screen = await artifact('../app/reading/[readingId].tsx');
    expect(screen).toContain("const shell = projectMobileOfficialReadingShellV1(locale)");
    expect(screen).toContain('officialReadingArchiveFailureCopyV1(state.message, locale)');
    expect(screen).toContain('{shell.original}');
    expect(screen).toContain('{shell.readerBoundary}');
    expect(screen).toContain('{shell.stepPrefix} {index + 1}');
    expect(screen).toContain('shell.readerCount(state.record.readerCharacterIds.length)');
    expect(screen).toContain('shell.noReader');
    expect(screen).toContain('sourceNotice.visible ? (');
    expect(screen).toContain('{sourceNotice.text}');
    expect(screen).toContain('>{step.title}</Text>');
    expect(screen).toContain('>{step.primary}</Text>');
    expect(screen).toContain('>{text}');
    expect(screen).toContain('{notice}');
    expect(screen).not.toContain('shell.translateReading');
    expect(screen).not.toContain('translateMobileUiCopy(step.primary');
    expect(screen).not.toContain('readingLocale: locale');
    expect(screen).toContain('mobileRecordsServiceV1.readOfficialReading(readingId)');
    expect(screen).toContain('<MobileOfficialReadingReaderEntry record={state.record} />');
  });
});
