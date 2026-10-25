import { describe, expect, it } from 'vitest';
import { faceReadingUiStateV1 } from '../face-reading-ui-locale.js';

describe('Face photo preparation UI localization', () => {
  const input = { readerKey: 'seyeon', readerFallback: '세연' };

  it('repaints idle and ready copy in all supported UI locales without enabling analysis', () => {
    for (const locale of ['ja-JP', 'zh-TW'] as const) {
      const idle = faceReadingUiStateV1(input, locale);
      const ready = faceReadingUiStateV1({
        ...input, phase: 'ready', fileName: '내사진.jpg', fileSize: 1572864,
      }, locale);
      expect(idle.analyzeLabel).not.toMatch(/[가-힣]/u);
      expect(idle.description).not.toMatch(/[가-힣]/u);
      expect(ready.description).not.toMatch(/[가-힣]/u);
      expect(ready.statusCopy).not.toMatch(/[가-힣]/u);
      expect(ready.fileMeta).toContain('1.5MB');
      expect(ready.fileMeta).not.toMatch(/[가-힣]/u);
      expect(ready.fileName).toBe('내사진.jpg');
      expect(ready.analyzeLabel).not.toMatch(/[가-힣]/u);
    }
    expect(faceReadingUiStateV1(input, 'ko-KR').analyzeLabel).toBe('사진을 먼저 준비해주세요');
    expect(faceReadingUiStateV1({ ...input, phase: 'ready', fileSize: 512 }, 'ko-KR').fileMeta)
      .toBe('1KB · 미리보기 준비됨');
  });

  it('retains the specific loading/error state when language changes', () => {
    for (const phase of ['loading', 'invalid-file', 'read-error', 'invalid-image', 'image-error'] as const) {
      const ko = faceReadingUiStateV1({ ...input, phase }, 'ko-KR');
      const ja = faceReadingUiStateV1({ ...input, phase }, 'ja-JP');
      const zh = faceReadingUiStateV1({ ...input, phase }, 'zh-TW');
      expect(ja.description).not.toBe(ko.description);
      expect(zh.description).not.toBe(ko.description);
      expect(ja.description).not.toMatch(/[가-힣]/u);
      expect(zh.description).not.toMatch(/[가-힣]/u);
    }
    expect(faceReadingUiStateV1({ ...input, phase: 'invalid-file' }, 'ja-JP').description).toContain('16MB');
    expect(faceReadingUiStateV1({ ...input, phase: 'image-error' }, 'zh-TW').description).toContain('JPEG');
  });

  it('renders English and Simplified Chinese photo preparation and error UI without changing source photos', () => {
    for (const locale of ['en-US', 'zh-CN'] as const) {
      for (const phase of ['idle', 'ready', 'loading', 'invalid-file', 'read-error', 'invalid-image', 'image-error'] as const) {
        const displayed = faceReadingUiStateV1({ ...input, phase, fileName: '내사진.jpg', fileSize: 1572864 }, locale);
        expect(displayed.description).not.toMatch(/[가-힣]/u);
        expect(displayed.statusTitle).not.toMatch(/[가-힣]/u);
        expect(displayed.statusCopy).not.toMatch(/[가-힣]/u);
        expect(displayed.analyzeLabel).not.toMatch(/[가-힣]/u);
        expect(displayed.fileName).toBe('내사진.jpg');
      }
    }
  });
});
