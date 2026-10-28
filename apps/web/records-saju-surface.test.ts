import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(process.cwd(), 'apps/web');
const readWeb = (name: string) => readFileSync(resolve(webRoot, name), 'utf8');

describe('Records Saju history surface', () => {
  const html = `${readWeb('records.html')}\n${readWeb('src/records/RecordsPage.tsx')}`;
  const page = readWeb('records-page.js');
  const client = readWeb('records-runtime-client.js');
  const readerLocale = readWeb('reader-provenance-locale.js');
  const recordsUiLocale = readWeb('records-page-ui-locale.js');
  const css = readWeb('records-v2.css');

  it('keeps Saju reading records separate from Life Facts and other record domains', () => {
    expect(html).toContain('aria-controls="saju-records"');
    expect(html).toContain('id="saju-records-list"');
    expect(html).toContain('>사주 보고서<');
    expect(html).toContain('>나의 사주 보고서<');
    expect(html).toContain('>다른 기록<');
    expect(html).toContain('aria-selected="true" aria-controls="saju-records"');
    expect(html).toContain('aria-labelledby="life-records-tab" hidden');
    expect(html).toContain('완료되어 저장된 사주 풀이 이력을 삶의 사실과 분리해 확인합니다.');
    expect(html).toContain('>현세록<');
    expect(html).toContain('>명식록<');
    expect(html).toContain('>대리가 기억<');
  });

  it('loads persisted Reading History with the same Records bearer', () => {
    expect(client).toContain("readings: '/api/readings'");
    expect(client).toContain("parseReadingHistoryPayloadV1");
    expect(client).toContain('readReadings: () => readStable(async (bearer) =>');
    expect(client).toContain("await readPagedCollection(fetchImpl, endpoints.readings, bearer, 'readings')");
    expect(client).toContain('if (seenCursors.has(nextCursor))');
    expect(client).toContain('const [lifeResult, readingResult, memoryResult, birthResult] = await Promise.allSettled([');
    expect(client).toContain("result.reason.code === 'WEB_RECORDS_SESSION_REQUIRED'");
    expect(client).toContain("const unavailable = Object.freeze({ status: 'unavailable' });");
    expect(client).toContain('projectReadingHistory(readingResult.value)');
    expect(client).toContain('return Object.freeze({ profile, lifeFacts, readings, memories, birth });');
  });

  it('renders persisted Reading history before any development-only sample fallback', () => {
    expect(page).toContain("requireArray(readingPayload, 'readings')");
    expect(page).toContain('if (readings.length > 0)');
    expect(page).toContain('for (const reading of readings) renderPersistedReading(target, reading);');
    expect(readerLocale).toContain('resolveCharacterDisplayNameV1(id, language)');
    expect(page).toContain("records-reading-card records-reading-card--persisted");
    expect(page).toContain('readerProvenanceLocaleLabelV1(reading.readerCharacterIds, getUiLocale())');
    expect(page).toContain('readerBadgeSources.set(badge, reading.readerCharacterIds)');
    expect(page).toContain('if (allowsDevelopmentSajuSamples())');
    expect(page).toContain('renderSajuReadingSamples(target, lifeFactsPayload)');
    expect(page).toContain('renderSajuReadingEmpty(target);');
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
      expect(page).toContain(`${domain}: Object.freeze(`);
    }
    expect(page).not.toContain('annual: Object.freeze(');
    expect(page).not.toContain('monthly: Object.freeze(');
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

  it('recognizes only the explicit sample fixture contract and removes it from the Life Fact ledger', () => {
    expect(page).toContain("const SAMPLE_SAJU_FACT_TYPE = 'sample_saju_reading_result';");
    expect(page).toContain("const SAMPLE_SAJU_SCHEMA_VERSION = 'sample.v1';");
    expect(page).toContain('fact.valueJsonb.sample === true');
    expect(page).toContain("requireArray(payload, 'facts').filter((fact) => !isSampleSajuReadingFact(fact))");
    expect(page).toContain("requireArray(lifeFactsPayload, 'facts').filter(isSampleSajuReadingFact)");
  });

  it('allows sample cards only on explicit loopback development hosts', () => {
    expect(page).toContain("new Set(['localhost', '127.0.0.1', '::1', '[::1]'])");
    expect(page).toContain('DEVELOPMENT_SAMPLE_HOSTS.has(window.location.hostname.toLowerCase())');
    expect(page).not.toContain('myeongha.vercel.app');
    expect(page).not.toContain('.vercel.app');
  });

  it('keeps the fallback honest and never invents snapshot semantics or a score', () => {
    expect(page).toContain("records-reading-card records-reading-card--sample");
    expect(page).toContain("records-reading-badge', uiText('개발 샘플')");
    expect(page).toContain('실제 Reading이 없을 때만 보이는 UI fixture');
    expect(page).toContain("empty.className = 'records-reading-empty'");
    expect(page).toContain('아직 저장된 사주 풀이가 없습니다.');
    expect(page).toContain("link.href = options.href ?? 'reading.html';");
    expect(page).toContain('buildPersistedReadingHandoffUrlV1({');
    expect(page).toContain("'저장된 풀이 열기 →'");
    expect(page).not.toContain('responseSnapshotJsonb');
    expect(page).not.toContain('value.score');
    expect(page).not.toContain('점수');
    expect(css).toContain('.records-reading-card');
    expect(css).toContain('.records-reading-chip');
    expect(css).toContain('.records-reading-highlights');
  });
});
