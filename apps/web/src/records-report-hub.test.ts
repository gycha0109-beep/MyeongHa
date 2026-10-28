import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { recordsReportCountV1 } from '../records-page-ui-locale.js';
import { RECORDS_HUB_STATIC_UI_COPY_V1 } from '../ui-records-hub-copy.js';

const webRoot = resolve(process.cwd(), 'apps/web');
const readWeb = (path: string) => readFileSync(resolve(webRoot, path), 'utf8');

describe('Records official-report-first entry', () => {
  const jsx = readWeb('src/records/RecordsPage.tsx');
  const page = readWeb('records-page.js');

  it('opens the authoritative Reading History by default without removing other record domains', () => {
    expect(jsx).toContain('aria-selected="true" aria-controls="saju-records"');
    expect(jsx).toContain('id="saju-records" className="records-tab-panel records-report-home" role="tabpanel" aria-labelledby="saju-records-tab">');
    for (const domain of ['life', 'birth', 'memory']) {
      expect(jsx).toContain(`aria-controls="${domain}-records"`);
      expect(jsx).toContain(`id="${domain}-records"`);
    }
    expect(page).toContain("requestedTab === 'saju'");
    expect(page).toContain("life: 'life-records-tab'");
    expect(page).toContain("birth: 'birth-records-tab'");
    expect(page).toContain("memory: 'memory-records-tab'");
    expect(page).toContain("document.body.dataset.recordsEntry = fromReading ? 'reading-handoff' : 'saju-deeplink'");
  });

  it('counts only authenticated Reading History and does not treat fixture cards as purchased reports', () => {
    expect(page).toContain("byId('saju-records-count').textContent = recordsReportCountV1(readings.length, getUiLocale());");
    expect(page).toContain("const readings = requireArray(readingPayload, 'readings');");
    expect(page).toContain("if (allowsDevelopmentSajuSamples())");
    expect(page).toContain("explore.href = 'reading.html'");
    expect(page).not.toContain('records-report-purchase-count');
    expect(page).not.toContain('records-report-price');
  });

  it('never treats a failed records request as an empty report archive', () => {
    expect(page).toContain("if (readingPayload?.status === 'unavailable')");
    expect(page).toContain("byId('saju-records-count').textContent = uiText('조회할 수 없음');");
    expect(page).toContain('조회가 실패한 상태이며, 기록이 없다는 뜻은 아닙니다.');
    expect(page).toContain("if (payload?.status === 'unavailable')");
    expect(page).toContain("lifeFactsPayload?.status !== 'unavailable'");
  });

  it('formats verified saved-record count for every supported locale', () => {
    const locale = ['ko-KR', 'ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const;
    for (const tag of locale) {
      expect(recordsReportCountV1(0, tag)).toContain('0');
      expect(recordsReportCountV1(2, tag)).toContain('2');
    }
    expect(recordsReportCountV1(1, 'en-US')).toBe('1 saved record');
    expect(recordsReportCountV1(2, 'en-US')).toBe('2 saved records');
    expect(() => recordsReportCountV1(-1)).toThrow();
    expect(() => recordsReportCountV1(0.5)).toThrow();
  });

  it('localizes only static hub labels, not user-written data or the official Reading snapshot', () => {
    const sources = ['사주 보고서', '다른 기록', '나의 사주 보고서', '보관된 사주 기록', '기록 확인 중…'];
    for (const source of sources) {
      const row = RECORDS_HUB_STATIC_UI_COPY_V1.get(source);
      expect(row).toBeDefined();
      for (const locale of ['ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const) {
        expect(row?.[locale]).toBeTruthy();
        expect(row?.[locale]).not.toMatch(/[가-힣]/u);
      }
    }
    expect(RECORDS_HUB_STATIC_UI_COPY_V1.has('민감한 개인정보')).toBe(false);
    expect(RECORDS_HUB_STATIC_UI_COPY_V1.has('responseSnapshotJsonb')).toBe(false);
  });
});
