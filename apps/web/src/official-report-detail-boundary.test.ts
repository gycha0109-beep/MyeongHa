import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RECORDS_HUB_STATIC_UI_COPY_V1 } from '../ui-records-hub-copy.js';

const root = resolve(process.cwd(), 'apps/web');
const readWeb = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('Records long-form official report boundary', () => {
  const jsx = readWeb('src/reading-detail/ReadingDetailPage.tsx');
  const runtime = readWeb('reading-character.js');
  const css = readWeb('reading-detail-shell.css');

  it('provides an all-at-once official Reading document without changing the preview route', () => {
    expect(jsx).toContain('data-official-report hidden');
    expect(jsx).toContain('data-official-report-toc');
    expect(jsx).toContain('data-official-report-sections');
    expect(jsx).toContain('data-official-report-date');
    expect(jsx).toContain('data-official-report-version');
    expect(jsx).toContain('data-official-report-step-mode');
    expect(jsx).toContain('data-official-report-return hidden');
    expect(jsx).toContain('data-reading-stage hidden');
    expect(css).toContain('.official-report-section');
    expect(css).toContain('.official-report-toc');
  });

  it('reuses the existing current-subject exact Reading boundary and same authorized content', () => {
    expect(runtime).toContain('parseOfficialReadingRecordPayloadV1(payload.data)');
    expect(runtime).toContain("record.readingId !== persistedReadingHandoff.readingId");
    expect(runtime).toContain("record.readingSessionId !== persistedReadingHandoff.readingSessionId");
    expect(runtime).toContain("record.sajuDomain !== persistedReadingHandoff.sajuDomain");
    expect(runtime).toContain("activatePreviewReading({ ...readingView, source: 'record', record });");
    expect(runtime).toContain('function renderAuthorizedStoredReport(preview, record)');
    expect(runtime).toContain('for (const [index, step] of preview.steps.entries())');
    expect(runtime).toContain('primary.textContent = step.primary;');
    expect(runtime).toContain('extra.textContent = text;');
    expect(runtime).toContain('ground.textContent = text;');
    expect(runtime).not.toContain('report.innerHTML');
    expect(runtime).not.toContain('sections.innerHTML');
    expect(runtime).toContain('if (stage && report && !report.hidden) stage.hidden = true;');
  });

  it('removes the visible original content when the current account or credential changes', () => {
    expect(runtime).toContain("function clearPersistedReadingPresentation() {");
    expect(runtime).toContain("if (report) report.hidden = true;");
    expect(runtime).toContain("document.querySelector('[data-official-report-sections]')?.replaceChildren()");
    expect(runtime).toContain("document.querySelector('[data-official-report-toc]')?.replaceChildren()");
    expect(runtime).toContain("if (!activeReadingOwner || !ensureResponseOwnerCurrent(activeReadingOwner)) return;");
    expect(runtime).toContain("function renderPersistedReadingFailure(title, copy, state = 'persisted_record_unavailable') {\n  clearPersistedReadingPresentation();");
    expect(runtime).toContain('window.addEventListener(PRODUCT_AUTH_STORAGE_V1.changedEvent, onReadingAuthChanged)');
  });

  it('has five-locale fixed controls without translating report source text', () => {
    for (const source of [
      '저장된 공식 사주 보고서', '발행일', '해석 버전',
      '보고서 목차', '해석의 적용 범위', '단계별 읽기',
      '보고서 전체 보기', '이 해석의 구조 보기',
    ]) {
      const translation = RECORDS_HUB_STATIC_UI_COPY_V1.get(source);
      expect(translation).toBeDefined();
      for (const locale of ['ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const) {
        expect(translation?.[locale]).toBeTruthy();
      }
    }
    expect(runtime).toContain("heading.dataset.officialReading = '';");
    expect(runtime).toContain("primary.dataset.officialReading = '';");
    expect(runtime).toContain("noticeText.dataset.officialReading = '';");
  });
});
