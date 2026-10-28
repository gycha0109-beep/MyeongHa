import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RECORDS_HUB_STATIC_UI_COPY_V1 } from '../ui-records-hub-copy.js';

const root = resolve(process.cwd(), 'apps/web');
const readWeb = (file: string) => readFileSync(resolve(root, file), 'utf8').replace(/\r\n/gu, '\n');

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

  it('shows only evidence and reader history from the authorized snapshot, never inferred Birth revision', () => {
    expect(jsx).toContain('data-official-report-facts hidden');
    expect(jsx).toContain('data-official-report-first hidden');
    expect(jsx).toContain('data-official-report-reader');
    expect(jsx).toContain('발행 당시 출생정보 차수');
    expect(jsx).toContain('이 기록에 제공되지 않음');
    expect(jsx).toContain('현재 명식록 확인하기 →');
    expect(runtime).toContain('renderStoredReportEvidence(preview.calculationSummary)');
    expect(runtime).toContain('firstText.textContent = preview.steps[0].primary;');
    expect(runtime).toContain("const ids = record.readerCharacterIds;");
    expect(runtime).toContain("resolveCharacterDisplayNameV1(id, getUiLocale()) ?? id");
    expect(runtime).not.toContain('currentBirthRevision ===');
    expect(runtime).not.toContain('requestPaidRegeneration(');
    expect(runtime).toContain("if (facts) facts.hidden = true;");
    expect(runtime).toContain("if (first) first.hidden = true;");
    expect(runtime).toContain("document.querySelector('[data-chart-five-elements]')?.replaceChildren()");
    expect(runtime).toContain("document.querySelector('[data-chart-ten-gods]')?.replaceChildren()");
    expect(runtime).toContain("'[data-official-report-notice-text]', '[data-official-report-date]'");
    expect(runtime).toContain("'[data-reading-step-body]', '[data-reading-structure-body]'");
    expect(runtime).toContain("if (!mayRenderCurrentStoredRecord()) return;");
    expect(runtime).toContain("activeReadingOwner !== null && ensureResponseOwnerCurrent(activeReadingOwner)");
  });

  it('focuses owner-authorized report sections and restores keyboard focus on mode changes', () => {
    expect(jsx).toContain('data-official-report-heading tabIndex={-1}');
    expect(jsx).toContain('data-reading-step-title tabIndex={-1}');
    expect(runtime).toContain('section.tabIndex = -1;');
    expect(runtime).toContain("section.setAttribute('aria-labelledby', heading.id);");
    expect(runtime).toContain("anchor.addEventListener('click', (event) => {");
    expect(runtime).toContain('event.preventDefault();');
    expect(runtime).toContain('section.focus({ preventScroll: true });');
    expect(runtime).toContain('const requestedSection = /^#official-report-section-');
    expect(runtime).toContain("section.scrollIntoView({ block: 'start' });");
    expect(runtime).toContain('stepTitle?.focus();');
    expect(runtime).toContain('reportHeading?.focus();');
    expect(css).toContain('.official-report-section:focus-visible');
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
