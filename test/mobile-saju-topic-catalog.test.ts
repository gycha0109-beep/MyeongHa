import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  MOBILE_SAJU_TOPICS_V1,
} from '../apps/mobile/src/features/saju/mobile-saju-topic-catalog.js';
import { resolveReadingDetailRoute } from '../apps/web/reading-detail-route.js';

const expectedWebHrefs = [
  'reading-detail.html?topic=career',
  'reading-detail.html?topic=money',
  'reading-detail.html?topic=love',
  'reading-detail.html?topic=business',
  'reading-detail.html?scope=year',
  'reading-detail.html?scope=month',
] as const;

describe('mobile Saju topic parity with the web hub', () => {
  it('exposes every current web Saju hub route exactly once', async () => {
    const webHub = await readFile(
      new URL('../apps/web/src/reading/ReadingPage.tsx', import.meta.url),
      'utf8',
    );
    const visibleWebHrefs = new Set(
      Array.from(
        webHub.matchAll(/reading-detail\.html\?[^'"\s}]+/gu),
        (match) => match[0],
      ),
    );

    expect([...visibleWebHrefs].sort()).toEqual([...expectedWebHrefs].sort());
    const mobileHrefs = new Set(MOBILE_SAJU_TOPICS_V1.map((topic) => topic.webHref));
    expect(expectedWebHrefs.every((href) => mobileHrefs.has(href))).toBe(true);
    expect(new Set(MOBILE_SAJU_TOPICS_V1.map((topic) => topic.key)).size).toBe(MOBILE_SAJU_TOPICS_V1.length);
  });

  it('keeps mobile labels aligned with the web route authority', () => {
    for (const topic of MOBILE_SAJU_TOPICS_V1) {
      const search = topic.webHref.slice(topic.webHref.indexOf('?'));
      const route = resolveReadingDetailRoute(search);
      expect(route).toMatchObject({
        valid: true,
        label: topic.label,
      });
    }
  });

  it('exposes only the four publicly listed approved Preview readings', () => {
    const executable = MOBILE_SAJU_TOPICS_V1
      .filter((topic) => topic.availability.kind === 'preview')
      .map((topic) =>
        topic.availability.kind === 'preview'
          ? [topic.key, topic.availability.readingText]
          : null,
      );

    expect(executable).toEqual([
      ['career', '직업운'],
      ['money', '재물운'],
      ['love', '연애운'],
      ['business', '사업운'],
    ]);
  });

  it('fails closed for web-visible topics outside current Preview authority', () => {
    const blocked = MOBILE_SAJU_TOPICS_V1
      .filter((topic) => topic.availability.kind === 'blocked')
      .map((topic) => topic.key);

    expect(blocked).toEqual([
      'family',
      'life-stage',
      'year',
      'month',
      'spouse',
      'compatibility',
      'question-specific',
    ]);
  });
});
