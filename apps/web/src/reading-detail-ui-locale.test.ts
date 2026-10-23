import { describe, expect, it } from 'vitest';
import {
  readingScopeLabelV1, readingSceneProgressV1, readingRouteStateCopyV1,
} from '../reading-detail-ui-locale.js';

describe('authored Reading scene locale presentation', () => {
  it('repaints scope and variable step count without changing the reading identity', () => {
    expect(readingScopeLabelV1('year', 2026, 'ko-KR')).toBe('2026년 · 올해');
    expect(readingScopeLabelV1('year', 2026, 'ja-JP')).toBe('2026年 · 今年');
    expect(readingScopeLabelV1('month', 2026, 'zh-TW')).toBe('本月');

    const flags = { hasStructure: true, hasSupporting: false };
    expect(readingSceneProgressV1(1, 3, flags, false, 'ko-KR').progress).toBe('읽기 2 / 3');
    expect(readingSceneProgressV1(1, 3, flags, false, 'ja-JP').progress).toBe('鑑定 2 / 3');
    expect(readingSceneProgressV1(1, 3, flags, false, 'zh-TW').progress).toBe('解讀 2 / 3');
    expect(readingSceneProgressV1(2, 3, flags, false, 'ja-JP').nextLabel).toBe('鑑定を終了');
    expect(readingSceneProgressV1(2, 3, flags, true, 'zh-TW').authorityNote).toContain('正式八字解讀');
  });

  it('keeps unsupported reading requests blocked in every locale', () => {
    const route = Object.freeze({ topic: 'career', label: '직업 · 커리어', scope: 'original' });
    const request = Object.freeze({ state: 'requires_input', input: 'question' });
    const ko = readingRouteStateCopyV1(route, request, 'blocked', 2026, 'ko-KR');
    const ja = readingRouteStateCopyV1(route, request, 'blocked', 2026, 'ja-JP');
    const zh = readingRouteStateCopyV1(route, request, 'blocked', 2026, 'zh-TW');
    expect(ko.stateTitle).toBe('직업 · 커리어 읽기는 아직 준비 중입니다.');
    expect(ja.stateTitle).toContain('準備中');
    expect(zh.stateCopy).toContain('不會送出');
    expect(request.state).toBe('requires_input');
    expect(route.scope).toBe('original');
  });

  it('changes only UI status, preserving the exact engine adapter version', () => {
    const route = Object.freeze({ topic: 'general', label: '전체 사주', scope: 'year' });
    const request = Object.freeze({ state: 'ready', adapterVersion: 'adapter-v1' });
    const blocked = readingRouteStateCopyV1(route, request, 'blocked', 2026, 'ja-JP');
    const loading = readingRouteStateCopyV1(route, request, 'preview_loading', 2026, 'zh-TW');
    expect(blocked.stateCopy).toContain('adapter-v1');
    expect(blocked.stateCopy).toContain('送信しません');
    expect(loading.productTitle).toBe('2026年 · 今年');
    expect(loading.stateCopy).toContain('出生資料');
    expect(readingSceneProgressV1(0, 1, { hasStructure: false, hasSupporting: false }, false, 'unknown').progress)
      .toBe('읽기 1 / 1');
    for (const locale of ['en-US', 'zh-CN']) {
      expect(readingScopeLabelV1('year', 2026, locale)).toBe('2026년 · 올해');
      expect(readingSceneProgressV1(0, 1, { hasStructure: false, hasSupporting: false }, true, locale).authorityNote)
        .toContain('공식 사주 풀이');
      const fallback = readingRouteStateCopyV1(route, request, 'blocked', 2026, locale);
      expect(fallback.stateCopy).toContain('adapter-v1');
      expect(fallback.stateCopy).toContain('전송하지 않습니다');
    }
  });
});
