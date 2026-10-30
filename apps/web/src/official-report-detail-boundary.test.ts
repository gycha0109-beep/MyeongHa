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
  const stageCss = readWeb('reading-v3.css');
  const localeRuntime = readWeb('ui-i18n.js');

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
    expect(runtime).toContain('const readingView = stepsFromIssuedProductResponse(record.reading, { isStoredRecord: true });');
    expect(runtime).not.toContain("data: { lifecycle: 'preview', reading: record.reading }");
    expect(runtime).toContain('function previewStepsFromPayload(payload, { requireBrowserAdmission = false } = {})');
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
    expect(runtime).toContain('firstText.textContent = firstInterpretedStep.primary;');
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

  it('displays issued/current Birth revisions only from protected archive metadata', () => {
    expect(jsx).toContain('data-official-report-birth-issued');
    expect(jsx).toContain('data-official-report-birth-current');
    expect(jsx).toContain('data-official-report-birth-status');
    expect(jsx).toContain('data-official-report-regenerate disabled');
    expect(runtime).toContain('function renderOfficialReportBirthRevision(birthRevision)');
    expect(runtime).toContain('renderOfficialReportBirthRevision(record.birthRevision);');
    expect(runtime).toContain('renderOfficialReportBirthRevision(preview.record.birthRevision);');
    expect(runtime).toContain("'[data-official-report-birth-issued]'");
    expect(runtime).toContain("'[data-official-report-birth-current]'");
    expect(runtime).toContain("'[data-official-report-birth-status]'");
    expect(runtime).not.toContain("fetch('/api/me/birth-profile'");
    expect(runtime).not.toContain('requestPaidRegeneration(');
    for (const source of [
      '현재 명식록 차수',
      '발행 당시 명식과 현재 명식이 같습니다.',
      '현재 명식이 발행 당시와 다릅니다. 이 보고서는 발행 당시 명식을 기준으로 유지됩니다.',
      '발행 당시 명식과 현재 명식의 변경 여부를 확인할 수 없습니다.',
      '새 명식 기준 재생성 준비 중',
    ]) {
      const translation = RECORDS_HUB_STATIC_UI_COPY_V1.get(source);
      expect(translation).toBeDefined();
      for (const locale of ['ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const) {
        expect(translation?.[locale]).toBeTruthy();
      }
    }
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

  it('shows only available official elemental and ten-god evidence groups', () => {
    expect(jsx).toContain('data-official-report-elements-group hidden');
    expect(jsx).toContain('data-official-report-gods-group hidden');
    expect(runtime).toContain('if (elementGroup) elementGroup.hidden = !hasElements;');
    expect(runtime).toContain('if (godGroup) godGroup.hidden = !hasGods;');
    expect(runtime).toContain("document.querySelector('[data-official-report-elements-group]')?.setAttribute('hidden', '')");
    expect(runtime).toContain("document.querySelector('[data-official-report-gods-group]')?.setAttribute('hidden', '')");
  });

  it('preserves every official scope limitation and hides missing structural evidence', () => {
    expect(runtime).toContain("notices.filter((text) => typeof text === 'string' && text.trim()).join('\\n\\n')");
    expect(runtime).not.toContain("notices.find((text)");
    expect(runtime).toContain("structureBlock.hidden = isStoredRecord && structureParts.length === 0;");
    expect(runtime).toContain("isStoredRecord ? '' : '원국에서 확인된 해석 축을 바탕으로 읽는 항목입니다.'");
  });

  it('separates stored supplementary interpretation from provenance evidence in step mode', () => {
    expect(jsx).toContain('data-reading-supporting hidden');
    expect(jsx).toContain('data-reading-supporting-title');
    expect(jsx).toContain('data-reading-supporting-body');
    expect(runtime).toContain('readingStepSourceCategoriesV1(step, isStoredRecord)');
    expect(runtime).toContain('const structureParts = sourceCategories.structure;');
    expect(runtime).toContain('supportingBlock.hidden = sourceCategories.supporting.length === 0');
    expect(runtime).toContain('sourceCategories.supporting.join');
    expect(runtime).toContain("'[data-reading-supporting-body]'");
    expect(css).toContain('[data-reading-supporting-body]{white-space:pre-wrap;');
  });
  it('keeps all stored scope limitations visible in step mode without generating new source text', () => {
    expect(jsx).toContain('data-reading-step-notice hidden');
    expect(jsx).toContain('data-reading-step-notice-heading');
    expect(jsx).toContain('data-reading-step-notice-text');
    expect(runtime).toContain("document.querySelector('[data-reading-step-notice]')?.setAttribute('hidden', '')");
    expect(runtime).toContain("'[data-reading-step-notice-text]'");
    expect(runtime).toContain('const visibleScopeNotice = isStoredRecord');
    expect(runtime).toContain('scopeNotice.hidden = visibleScopeNotice.length === 0');
    expect(runtime).toContain('scopeNoticeText.textContent = visibleScopeNotice');
    expect(runtime).toContain("translateStaticUi('해석의 적용 범위', getUiLocale())");
    expect(css).toContain('[data-reading-step-notice-text]{white-space:pre-wrap;');
    expect(runtime).toContain("notices.filter((text) => typeof text === 'string' && text.trim()).join('\\n\\n')");
    expect(runtime).toContain("if (isStoredRecord || item.type === 'scope_limitation')");
  });

  it('protects supplemental and limitation source text from five-locale UI translation', () => {
    expect(jsx).toContain('data-reading-step-title tabIndex={-1} data-reading-content');
    expect(jsx).toContain('data-reading-supporting-body data-reading-content');
    expect(jsx).toContain('data-reading-step-notice-text data-reading-content');
    expect(jsx).toContain('data-reading-step-notice hidden aria-labelledby="reading-step-scope-heading"');
    expect(jsx).toContain('id="reading-step-scope-heading" data-reading-step-notice-heading');
    expect(localeRuntime).toContain('[data-reading-step-title], [data-reading-step-body]');
    expect(localeRuntime).toContain('[data-reading-supporting-body], [data-reading-step-notice-text]');
    expect(localeRuntime).toContain('[data-chart-five-elements], [data-chart-ten-gods]');
    expect(localeRuntime).toContain('[data-official-report-elements], [data-official-report-gods]');
    expect(localeRuntime).toContain('[data-reading-content]');
    expect(localeRuntime).toContain('if (!parent || parent.matches(\'textarea\') || isBlocked(parent)) return;');
    expect(runtime).toContain("scopeNoticeHeading.textContent =");
    expect(runtime).toContain("translateStaticUi('해석의 적용 범위', getUiLocale())");
    expect(runtime).toContain('scopeNoticeText.textContent = visibleScopeNotice;');
  });

  it('keeps issued disclosures in the report notice instead of interpreting them as the first section', () => {
    expect(runtime).toContain("if (isStoredRecord || item.type === 'scope_limitation') {");
    expect(runtime).toContain("notices.push(item.text.trim());");
    expect(runtime).toContain("steps[0].supporting.push(item.text.trim());");
    expect(runtime).toContain("if (notice) notice.hidden = !preview.notice;");
    expect(runtime).toContain("if (scopeNotice) scopeNotice.hidden = visibleScopeNotice.length === 0;");
  });

  it('centers official step-by-step rereading without reopening the preview Reader scene', () => {
    expect(runtime).toContain("root.dataset.readingRecordMode = 'step_by_step';");
    expect(runtime).toContain("document.querySelector('.reader-scene')?.setAttribute('hidden', '')");
    expect(runtime).toContain("document.querySelector('.reading-character-block')?.setAttribute('hidden', '')");
    expect(stageCss).toContain('body[data-reading-record-mode="step_by_step"] .reading-stage {');
    expect(stageCss).toContain('body[data-reading-record-mode="step_by_step"] .reader-scene,');
    expect(stageCss).toContain('body[data-reading-record-mode="step_by_step"] .reading-character-block {');
    expect(stageCss).toContain('body[data-reading-record-mode="step_by_step"] .reading-sheet {');
    expect(stageCss).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(stageCss).toContain('border-radius: 15px;');
    expect(stageCss).not.toContain('body[data-reading-record-mode="preview"] .reader-scene');
  });

  it('keeps issued evidence-only sections but does not create an interpretation or preview result', () => {
    expect(runtime).toContain('issuedSectionSourcePartsV1(section.blocks, { isStoredRecord, structurePrefix: STRUCTURE_PREFIX })');
    expect(runtime).toContain('if (interpretation.length === 0 && (!isStoredRecord || structure.length === 0)) return [];');
    expect(runtime).toContain('isStoredRecord && !steps.some((step) => step.primary.length > 0)');
    expect(runtime).toContain('primary.hidden = step.primary.length === 0;');
    expect(runtime).toContain('primaryBlock.hidden = isStoredRecord && step.primary.length === 0;');
    expect(runtime).toContain('const firstInterpretedStep = preview.steps.find((step) => step.primary.length > 0);');
    expect(runtime).toContain('if (first && firstText && firstInterpretedStep)');
    expect(runtime).toContain('return stepsFromIssuedProductResponse(data.reading);');
  });
  it('blocks an explicit 403 without treating revoked access as a temporary Records failure', () => {
    const ownerDenied = runtime.indexOf('if (response.status === 403)');
    const genericFailure = runtime.indexOf('if (!response.ok || !payload || payload.ok !== true)');
    expect(ownerDenied).toBeGreaterThan(0);
    expect(ownerDenied).toBeLessThan(genericFailure);
    expect(runtime).toContain("'persisted_record_access_denied'");
    for (const source of [
      '이 공식 보고서의 열람 권한이 없습니다.',
      '현재 계정에서 이 저장된 해석에 접근할 수 없습니다. 기록 페이지에서 이용 가능 여부를 다시 확인해 주세요.',
    ]) {
      const translations = RECORDS_HUB_STATIC_UI_COPY_V1.get(source);
      expect(translations).toBeDefined();
      for (const locale of ['ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const) {
        expect(translations?.[locale]).toBeTruthy();
        expect(translations?.[locale]).not.toMatch(/[가-힣]/u);
      }
    }
  });

  it('retries only transient reads and rejects malformed stored official Reading without substitution', () => {
    expect(runtime).toContain("if (state === 'persisted_record_unavailable' && routeAction) {");
    expect(runtime).toContain('routeAction.href = window.location.href;');
    expect(runtime).toContain("'persisted_record_invalid_response'");
    expect(runtime).toContain('record = parseOfficialReadingRecordPayloadV1(payload.data);');
    expect(runtime).toContain('공식 기록 응답이 검증 기준을 충족하지 않았습니다. 다른 해석으로 대체하지 않습니다.');
    for (const source of [
      '저장된 보고서 다시 불러오기 →',
      '저장된 보고서의 내용을 확인할 수 없습니다.',
      '공식 기록 응답이 검증 기준을 충족하지 않았습니다. 다른 해석으로 대체하지 않습니다.',
    ]) {
      const translation = RECORDS_HUB_STATIC_UI_COPY_V1.get(source);
      expect(translation).toBeDefined();
      for (const locale of ['ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const) {
        expect(translation?.[locale]).toBeTruthy();
        expect(translation?.[locale]).not.toMatch(/[가-힣]/u);
      }
    }
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
