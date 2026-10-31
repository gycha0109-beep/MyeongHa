import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(process.cwd(), 'apps/web');
const readWeb = (name: string) => readFileSync(resolve(webRoot, name), 'utf8');

describe('Records Saju history surface', () => {
  const html = `${readWeb('records.html')}\n${readWeb('src/records/RecordsPage.tsx')}`;
  const page = readWeb('records-page.js');
  const domainPresentation = readWeb('reading-domain-presentation.js');
  const client = readWeb('records-runtime-client.js');
  const readerLocale = readWeb('reader-provenance-locale.js');
  const recordsUiLocale = readWeb('records-page-ui-locale.js');
  const css = readWeb('records-v2.css');

  it('keeps Saju reading records separate from Life Facts and other record domains', () => {
    expect(html).toContain('id="saju-records"');
    expect(html).toContain('id="saju-records-list"');
    expect(html).toContain('<h3>보관된 사주 기록</h3>');
    expect(html).not.toContain('records-report-intro');
    expect(html).not.toContain('records-tab-divider');
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('life-records-tab');
    expect(html).toContain('>보관된 사주 기록<');
    expect(html).not.toContain('>현세록<');
    expect(html).not.toContain('aria-controls="birth-records"');
    expect(html).not.toContain('aria-controls="memory-records"');
    expect(html).not.toContain('명식록 추가');
  });

  it('loads persisted Reading History with the same Records bearer', () => {
    expect(client).toContain("readings: '/api/readings'");
    expect(client).toContain("parseReadingHistoryPayloadV1");
    expect(client).toContain('readReadings: () => readStable(async (bearer) =>');
    expect(client).toContain("await readPagedCollection(fetchImpl, endpoints.readings, bearer, 'readings')");
    expect(client).toContain('if (seenCursors.has(nextCursor))');
    expect(client).not.toContain("lifeFacts: '/api/life-record'");
    expect(client).toContain("result.reason.code === 'WEB_RECORDS_SESSION_REQUIRED'");
    expect(client).toContain("const unavailable = Object.freeze({ status: 'unavailable' });");
    expect(client).toContain('projectReadingHistory(result.value)');
    expect(client).toContain('return Object.freeze({ profile, readings });');
  });

  it('renders persisted Reading history before any development-only sample fallback', () => {
    expect(page).toContain("requireArray(readingPayload, 'readings')");
    expect(page).toContain('if (readings.length > 0)');
    expect(page).toContain('for (const reading of readings) renderPersistedReading(target, reading);');
    expect(readerLocale).toContain('resolveCharacterDisplayNameV1(id, language)');
    expect(page).toContain("records-reading-card records-reading-card--persisted");
    expect(page).toContain('readerProvenanceLocaleLabelV1(reading.readerCharacterIds, getUiLocale())');
    expect(page).toContain('readerBadgeSources.set(badge, reading.readerCharacterIds)');
    expect(page).not.toContain('allowsDevelopmentSajuSamples');
    expect(page).not.toContain('renderSajuReadingSamples');
    expect(page).toContain('renderSajuReadingEmpty(target);');
  });

  it('discards cached personal Records when browser owner changes, including on locale repaint', async () => {
    const { RECORDS_HUB_STATIC_UI_COPY_V1 } = await import('./ui-records-hub-copy.js');
    expect(page).toContain('captureReadingResponseOwnerV1(');
    expect(page).toContain('isReadingResponseOwnerCurrentV1(');
    expect(page).toContain('const bearer = await ensureActiveBearer();');
    expect(page).toContain('const owner = captureRecordsOwner(bearer);');
    expect(page).toContain('if (!isRecordsOwnerCurrent(owner)) {');
    expect(page).toContain('displayedRecords = null;');
    expect(page).toContain('displayedRecordsOwner = null;');
    expect(page).toContain("byId('records-content').hidden = true;");
    expect(page).toContain("'saju-records-list', 'saju-records-count',");
    expect(page).toContain('byId(id).replaceChildren();');
    expect(page).toContain('window.addEventListener(PRODUCT_AUTH_STORAGE_V1.changedEvent, onRecordsAuthChanged);');
    expect(page).toContain("window.addEventListener('pageshow', onRecordsAuthChanged);");
    expect(page).toContain('onRecordsAuthChanged();\n    if (!displayedRecords) return;\n    renderLoadedRecords(displayedRecords);');
    const copy = RECORDS_HUB_STATIC_UI_COPY_V1.get(
      '계정 또는 세션이 변경되었습니다. 현재 계정의 기록을 보려면 새로고침해 주세요.',
    );
    expect(copy).toBeDefined();
    for (const locale of ['ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const) {
      expect(copy?.[locale]).toBeTruthy();
    }
  });

  it('labels authoritative delivered states as completed without using the stale complete alias', () => {
    expect(page).toContain("value === 'delivered' || value === 'delivered_with_fallback'");
    expect(page).toContain("return '완료'");
    expect(page).not.toContain("value === 'complete'");
  });

  it('maps only canonical SajuDomain values for persisted records', () => {
    for (const domain of [
      'general',
      'family',
      'relationship',
      'compatibility',
      'career',
      'business',
      'wealth',
      'life_stage',
      'question_specific',
    ]) {
      expect(domainPresentation).toContain(`${domain}: Object.freeze(`);
    }
    expect(page).toContain('readingDomainPresentationV1(sajuDomain)');
    expect(domainPresentation).not.toContain('annual: Object.freeze(');
    expect(domainPresentation).not.toContain('monthly: Object.freeze(');
  });

  it('shows archive open links only for delivered states', () => {
    expect(page).toContain('function isPersistedReadingOpenableState(value)');
    expect(page).toContain("value === 'delivered' || value === 'delivered_with_fallback'");
    expect(page).toContain('if (openable) {');
    expect(page).toContain("{ href: handoffUrl, label: '저장된 풀이 열기 →' }");
    expect(page).toContain("{ href: null, label: '완료 후 다시 열 수 있습니다.' }");
    expect(page).toContain('recordsReadingSummaryV1({');
    expect(recordsUiLocale).toContain('완료된 Official Reading만 다시 열 수 있습니다.');
  });

  it('keeps the fallback honest and never invents snapshot semantics or a score', () => {
    expect(page).not.toContain('records-reading-card--sample');
    expect(page).toContain("empty.className = 'records-reading-empty'");
    expect(page).toContain('아직 저장된 사주 풀이가 없습니다.');
    expect(page).toContain("link.href = options.href ?? 'reading.html';");
    expect(page).toContain('buildPersistedReadingHandoffUrlV1({');
    expect(page).toContain("'저장된 풀이 열기 →'");
    expect(page).not.toContain('responseSnapshotJsonb');
    expect(page).not.toContain('value.score');
    expect(page).not.toContain('점수');
    expect(css).toContain('.records-reading-card');

  });
});
