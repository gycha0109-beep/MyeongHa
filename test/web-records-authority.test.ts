import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = join(process.cwd(), 'apps', 'web');
const html = `${readFileSync(join(webRoot, 'records.html'), 'utf8')}\n${readFileSync(join(webRoot, 'src', 'records', 'RecordsPage.tsx'), 'utf8')}`;
const client = readFileSync(join(webRoot, 'records-runtime-client.js'), 'utf8');
const page = readFileSync(join(webRoot, 'records-page.js'), 'utf8');
const i18n = readFileSync(join(webRoot, 'ui-i18n.js'), 'utf8');
const handoff = readFileSync(join(webRoot, 'reading-history-handoff.js'), 'utf8');

describe('web records authority boundary', () => {
  it('removes the old demo identity and fabricated private records', () => {
    expect(html).not.toContain('John Doe 03');
    expect(html).not.toContain('2026.08.27');
    expect(html).not.toContain('새로운 프로젝트 방향을 고민');
    expect(html).not.toContain('기록판 3.0');
    expect(html).not.toContain('관계 이벤트');
  });

  it('keeps Records read-only without exposing mutation controls', () => {
    expect(client).toContain("method: 'GET'");
    expect(client).not.toContain("method: 'POST'");
    expect(client).not.toContain("method: 'PATCH'");
    expect(client).not.toContain("method: 'DELETE'");
    expect(html).not.toContain('data-record-delete');
    expect(html).not.toContain('data-record-revoke');
    expect(html).not.toContain('data-record-edit');
  });

  it('uses only canonical server-resolved current-subject reads', () => {
    expect(client).toContain("profile: '/api/me'");
    expect(client).toContain("readings: '/api/readings'");
    expect(client).not.toContain("lifeFacts: '/api/life-record'");
    expect(client).not.toContain('/v1/');
    expect(client).not.toContain('subjectId=');
    expect(client).not.toContain('authUserId');
    expect(client).toContain("credentials: 'same-origin'");
    expect(client).toContain("cache: 'no-store'");
  });

  it('unwraps the common API success envelope before rendering stored projections', () => {
    expect(client).toContain("from './api-envelope.js'");
    expect(client).toContain('unwrapApiSuccessEnvelope(envelope)');
    expect(client).toContain('WebApiEnvelopeError');
  });

  it('fails closed for missing session, failed transport, malformed JSON, and malformed envelopes', () => {
    expect(client).toContain('WEB_RECORDS_SESSION_REQUIRED');
    expect(client).toContain('WEB_RECORDS_REQUEST_FAILED');
    expect(client).toContain('WEB_RECORDS_MALFORMED_RESPONSE');
    expect(page).toContain('현재 기록을 불러올 수 없습니다. 잠시 뒤 다시 확인해 주세요.');
  });

  it('renders stored values as text rather than HTML', () => {
    expect(page).toContain('textContent');
    expect(page).not.toContain('innerHTML');
    expect(page).not.toContain('insertAdjacentHTML');
    expect(page).not.toContain('renderLifeFacts');
    expect(html).not.toContain('records-profile-strip');
    expect(page).not.toContain('records-display-name');
    expect(i18n).toContain('[data-records-source]');
  });

  it('marks Reading completion handoffs without restoring record tabs', () => {
    expect(page).toContain("params.get('tab') === 'saju'");
    expect(page).toContain("params.get('from') === 'reading'");
    expect(page).toContain("document.body.dataset.recordsEntry = 'reading-handoff'");
    expect(page).not.toContain('setupTabs');
    expect(html).not.toContain('role="tablist"');
  });

  it('links persisted Reading history by stored identifiers without inventing Reader authority', () => {
    expect(page).toContain("from './reading-history-handoff.js'");
    expect(page).toContain('buildPersistedReadingHandoffUrlV1({');
    expect(page).toContain('readingId: reading.readingId');
    expect(page).toContain('readingSessionId: reading.readingSessionId');
    expect(page).toContain('sajuDomain: reading.sajuDomain');
    expect(page).toContain("'저장된 풀이 열기 →'");
    expect(handoff).toContain("params.set('from', handoff.source)");
    expect(handoff).not.toContain("params.set('reader'");
    expect(handoff).not.toContain("params.set('character'");
    expect(handoff).not.toContain("params.set('threadId'");
  });

  it('does not request or render duplicate Birth and Character Memory data', () => {
    expect(html).not.toContain('birth-records');
    expect(html).not.toContain('memory-records');
    expect(page).not.toContain('renderCurrentBirthProfile');
    expect(page).not.toContain('renderMemories');
    expect(client).not.toContain('/api/me/birth-profile');
    expect(client).not.toContain('/api/memories');
  });
});
