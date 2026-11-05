import { describe, expect, it } from 'vitest';
import { formatLoadedRecordsCountV1, formatRecordDateV1 } from '../apps/mobile/src/features/records/records-view-model.js';

describe('mobile Records date presentation', () => {
  it('presents one server-owned source date in all five selected UI languages', () => {
    const timestamp = '2026-11-05T00:30:00.000Z';
    expect(formatRecordDateV1(timestamp)).toBe('2026.11.05');
    expect(formatRecordDateV1(timestamp, 'ko-KR')).toBe('2026.11.05');
    expect(formatRecordDateV1(timestamp, 'ja-JP')).toBe('2026年11月5日');
    expect(formatRecordDateV1(timestamp, 'zh-TW')).toBe('2026年11月5日');
    expect(formatRecordDateV1(timestamp, 'en-US')).toBe('November 5, 2026');
    expect(formatRecordDateV1(timestamp, 'zh-CN')).toBe('2026年11月5日');
  });

  it('keeps the server timestamp date without applying a device timezone', () => {
    const suppliedOffset = '2026-01-01T23:30:00-08:00';
    expect(formatRecordDateV1(suppliedOffset,'ko-KR')).toBe('2026.01.01');
    expect(formatRecordDateV1(suppliedOffset,'en-US')).toBe('January 1, 2026');
    expect(formatRecordDateV1('', 'en-US')).toBe('—');
  });
});

describe('mobile Records loaded-row count presentation', () => {
  it('renders all five supported UI locales and preserves the loaded count', () => {
    expect(formatLoadedRecordsCountV1(12, 'ko-KR')).toBe('현재 불러온 기록 12건');
    expect(formatLoadedRecordsCountV1(12, 'ja-JP')).toBe('読み込み済み 12件');
    expect(formatLoadedRecordsCountV1(12, 'zh-TW')).toBe('已載入 12筆紀錄');
    expect(formatLoadedRecordsCountV1(12, 'en-US')).toBe('Loaded 12 records');
    expect(formatLoadedRecordsCountV1(12, 'zh-CN')).toBe('已加载 12 条记录');
  });

  it('uses the singular English label for one record and plural for zero', () => {
    expect(formatLoadedRecordsCountV1(1, 'en-US')).toBe('Loaded 1 record');
    expect(formatLoadedRecordsCountV1(0, 'en-US')).toBe('Loaded 0 records');
  });
});
