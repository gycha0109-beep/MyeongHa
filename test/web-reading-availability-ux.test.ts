import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { resolveReadingAvailabilityV1 } from '../apps/web/src/reading/reading-availability.js';
import { resolveReadingDetailRoute } from '../apps/web/reading-detail-route.js';
import { resolveSajuButtonEngineRequest } from '../apps/web/reading-saju-engine-request.js';

const load = (name: string) =>
  readFile(new URL('../apps/web/' + name, import.meta.url), 'utf8');

const PREVIEW = [
  ['reading-detail.html?topic=temperament&scope=original', '전체 사주'],
  ['reading-detail.html?topic=career', '직업운'],
  ['reading-detail.html?topic=money', '재물운'],
  ['reading-detail.html?topic=love', '연애운'],
  ['reading-detail.html?topic=business', '사업운'],
] as const;

describe('Web Saju Product discovery: honest route availability', () => {
  it('labels only already admitted General Natal/topic Preview routes', async () => {
    const runtime = await load('reading-character.js');
    expect(runtime).toContain("const PREVIEW_READING_TEXTS = new Set(['전체 사주', '직업운', '재물운', '연애운', '사업운']);");
    for (const [href, readingText] of PREVIEW) {
      const route = resolveReadingDetailRoute(href.slice(href.indexOf('?')));
      expect(route).toMatchObject({ valid: true });
      const request = resolveSajuButtonEngineRequest(route);
      expect(request).toMatchObject({ state: 'ready', readingText });
      expect(resolveReadingAvailabilityV1(href)).toMatchObject({
        kind: 'preview', label: '프리뷰 확인',
      });
    }
  });

  it('does not suggest annual, monthly, spouse or life-stage Reading is public', () => {
    for (const href of [
      'reading-detail.html?scope=year',
      'reading-detail.html?scope=month',
      'reading-detail.html?topic=spouse',
      'reading-detail.html?topic=life-stage',
      'reading-detail.html?topic=career&scope=year',
      'reading-detail.html?topic=unknown',
    ]) {
      expect(resolveReadingAvailabilityV1(href).kind).toBe('unavailable');
    }
  });

  it('does not pretend family, compatibility or free-form questions are executable', () => {
    for (const href of [
      'reading-detail.html?topic=family',
      'reading-detail.html?topic=compatibility',
      'reading-detail.html?topic=question-specific',
    ]) {
      expect(resolveReadingAvailabilityV1(href)).toMatchObject({
        kind: 'input_pending', label: '추가 입력 준비 중',
      });
    }
  });

  it('sends the Home month feature to an existing preview, never unsupported monthly advice', async () => {
    const home = await load('src/home/HomePage.tsx');
    expect(home).toContain('이번 달 사주 읽기');
    expect(home).toContain('현재 월간 해석은 준비 중입니다.');
    expect(home).toContain('이달에는 전체 사주 프리뷰부터 시작해 보세요.');
    expect(home).toContain('href="reading-detail.html?topic=temperament&scope=original"');
    expect(home).not.toContain('href="reading-detail.html?scope=month"');
    expect(home).not.toContain('이번 달 운세를 확인했습니다');
  });

  it('makes availability clear before clicking each Saju card without granting Reader access', async () => {
    const [reading, home, css] = await Promise.all([
      load('src/reading/ReadingPage.tsx'),
      load('src/home/HomePage.tsx'),
      load('golden-master.css'),
    ]);
    expect(reading).toContain('resolveReadingAvailabilityV1(href).label');
    expect(reading).toContain('추가 입력 준비 중');
    expect(reading).toContain('정식 읽기 준비 중');
    expect(home).toContain('resolveReadingAvailabilityV1(');
    expect(css).toContain('reading-topic-availability.is-preview');
    for (const source of [home, reading]) {
      expect(source).not.toContain('publicRouteActivated: true');
      expect(source).not.toContain('readerCharacterId:');
      expect(source).not.toContain('entitlement: true');
    }
  });

  it('keeps development sample readings loopback-only', async () => {
    const records = await load('records-page.js');
    expect(records).toContain("DEVELOPMENT_SAMPLE_HOSTS.has(window.location.hostname.toLowerCase())");
    expect(records).toContain("if (allowsDevelopmentSajuSamples())");
    expect(records).not.toContain("DEVELOPMENT_SAMPLE_HOSTS.add('myeongha.vercel.app')");
  });
});
