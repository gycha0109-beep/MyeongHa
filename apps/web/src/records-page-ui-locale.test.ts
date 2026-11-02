import { describe, expect, it } from 'vitest';
import {
  recordsTimestampV1, recordsReadingSummaryV1,
} from '../records-page-ui-locale.js';

describe('Records authored presentation', () => {
  it('reformats a stored timestamp without changing the source value', () => {
    const timestamp = '2026-10-21T01:03:00Z';
    expect(recordsTimestampV1(timestamp, 'ko-KR')).not.toBe('—');
    expect(recordsTimestampV1(timestamp, 'ja-JP')).not.toBe('—');
    expect(recordsTimestampV1(timestamp, 'zh-TW')).not.toBe('—');
    expect(recordsTimestampV1('invalid', 'ja-JP')).toBe('—');
    expect(timestamp).toBe('2026-10-21T01:03:00Z');
  });

  it('preserves availability and identity when repainting an official history card', () => {
    const source = Object.freeze({ completedAt: '2026-10-21T00:00:00Z', title: 'Original user text', openable: true });
    const pending = { ...source, openable: false };
    for (const locale of ['ko-KR', 'ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const) {
      const delivered = recordsReadingSummaryV1(source, locale);
      const blocked = recordsReadingSummaryV1(pending, locale);
      expect(delivered).toContain(source.title);
      expect(blocked).toContain(source.title);
      expect(delivered).not.toBe(blocked);
      expect(blocked).toContain('Official Reading');
      if (locale !== 'ko-KR') {
        expect(delivered).not.toMatch(/[가-힣]/u);
        expect(blocked).not.toMatch(/[가-힣]/u);
      }
    }
    for (const locale of ['en-US', 'zh-CN']) {
      expect(recordsReadingSummaryV1(source, locale)).toContain(source.title);
      expect(recordsReadingSummaryV1(pending, locale)).toContain(source.title);
      expect(recordsReadingSummaryV1(pending, locale)).toContain('Official Reading');
    }
    expect(source.openable).toBe(true);
  });
});
