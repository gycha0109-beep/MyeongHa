import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readingHtmlPath = new URL('../apps/web/reading-detail.html', import.meta.url);
const readingPagePath = new URL('../apps/web/src/reading-detail/ReadingDetailPage.tsx', import.meta.url);
const readingCssPath = new URL('../apps/web/reading-v3.css', import.meta.url);
const readingScenesCssPath = new URL('../apps/web/reading-scenes.css', import.meta.url);
const readingRuntimePath = new URL('../apps/web/reading-character.js', import.meta.url);
const readingHandoffPath = new URL('../apps/web/reading-history-handoff.js', import.meta.url);
const baekheonScenePath = new URL('../apps/web/assets/characters/rooms/baekheon-room.webp', import.meta.url);

async function readReadingMarkup() {
  const [html, page] = await Promise.all([readFile(readingHtmlPath, 'utf8'), readFile(readingPagePath, 'utf8')]);
  return `${html}\n${page}`;
}

describe('MyeongHa character-led Saju Reading v1', () => {
  it('uses the approved product shell and keeps Saju as the active destination', async () => {
    const html = await readReadingMarkup();

    expect(html).toContain('href="product.css"');
    expect(html).toContain('href="reading-v3.css"');
    expect(html).toContain('href="reading-scenes.css"');
    expect(html).toContain('href="reading.html" aria-current="page"');
    expect(html).toContain('className="reading-stage"');
    expect(html).toContain('className="reader-scene"');
    expect(html).toContain('className="reading-sheet"');
    expect(html).not.toContain('John Doe');
    expect(html).not.toContain('DEMO');
  });

  it('keeps grounded Reading content ahead of character expression without leaking internal authority copy', async () => {
    const html = await readReadingMarkup();

    const flow = html.indexOf('data-reading-step-title');
    const structure = html.indexOf('data-reading-structure-title');
    const character = html.indexOf('reading-character-block');

    expect(flow).toBeGreaterThan(-1);
    expect(structure).toBeGreaterThan(flow);
    expect(character).toBeGreaterThan(structure);
    expect(html).toContain('data-reader-comment');
    expect(html).toContain('data-reading-authority-note');
    expect(html).not.toContain('캐릭터는 검증된 Reading의 표현과 후속 질문만 담당합니다.');
    expect(html).not.toContain('사주 의미는 검증된 Reading을 따르며, 캐릭터가 새로운 해석을 만들지 않습니다.');
  });

  it('supports the fixed nine-character roster without coupling layout geometry to one reader', async () => {
    const [runtime, css] = await Promise.all([
      readFile(readingRuntimePath, 'utf8'),
      readFile(readingCssPath, 'utf8'),
    ]);

    for (const key of ['baekheon', 'seyeon', 'yeoul', 'seorin', 'rahyeon', 'mira', 'taegyeom', 'yunho', 'doyun']) {
      expect(runtime).toContain(`${key}: {`);
      expect(css).toContain(`body[data-reader="${key}"]`);
    }

    for (const name of ['백헌', '세연', '여울', '서린', '라현', '미라', '태겸', '윤호', '도윤']) {
      expect(runtime).toContain(`['${name}',`);
    }

    expect(runtime).toContain("params.get('character') || params.get('reader')");
    expect(runtime).toContain('root.dataset.reader = presentationReaderHint');
    expect(runtime).toContain("root.dataset.readerSelection = params.has('reader') || params.has('character') ? 'explicit' : 'default';");
    expect(runtime).toContain("root.dataset.readerAuthority = 'presentation_hint_only';");
    expect(runtime).toContain("root.dataset.readerPresentation = 'reading-scene-v1';");
    expect(runtime).toContain('const readerKey = presentationReaderHint');
    expect(runtime).toContain('the server-returned readerCharacterId wins');
    expect(runtime).toContain('data-reader-hanja');
  });

  it('keeps normalized route identity in dataset state without replacing the document body', async () => {
    const runtime = await readFile(readingRuntimePath, 'utf8');

    expect(runtime).toContain('root.dataset.readingTopicKey = route.topic');
    expect(runtime).toContain('root.dataset.readingScopeKey = route.scope');
    expect(runtime).not.toContain('root.dataset.readingScope =');
    expect(runtime).toContain("document.querySelectorAll('[data-reading-scope]')");
    expect(runtime).not.toContain("params.get('scope') || 'year'");
  });

  it('keeps the result scaffold dormant until an admitted Preview Reading is delivered', async () => {
    const [html, runtime] = await Promise.all([
      readReadingMarkup(),
      readFile(readingRuntimePath, 'utf8'),
    ]);

    expect((html.match(/data-reading-progress-dot/g) ?? []).length).toBe(4);
    expect(html).toMatch(/<section className="reading-stage" data-reading-stage hidden/);
    expect(html).toContain('data-reading-route-state');
    expect(html).toContain('data-reading-next disabled');
    expect(html).toContain('data-reading-prev');
    expect(html).toContain('data-chart-open');
    expect(html).toContain('data-chart-dialog');
    expect(html).toContain('내 명식 보기');
    expect(runtime).toContain("? (previewEligible ? 'preview_loading' : 'blocked_by_authority')");
    expect(runtime).toContain("const SAJU_PREVIEW_READING_ENDPOINT = '/api/me/saju/preview-reading';");
    expect(runtime).toContain('activatePreviewReading(preview);');
    expect(runtime).toContain("const PREVIEW_NOTICE_SECTION_TITLE = '프리뷰 안내';");
    expect(runtime).toContain("const STRUCTURE_PREFIX = '근거 구조:';");
    expect(runtime).toContain("'이 해석의 사주 근거'");
    expect(runtime).toContain('previewCommentForStep()');
    expect(runtime).toContain("root.dataset.previewReaderVoice = 'disabled';");
    expect(runtime).not.toContain('suffixByReader');
    expect(runtime).not.toContain('readerCommentForStep');
    expect(runtime).not.toContain('const lead = firstSentence(step.primary)');
    expect(runtime).not.toContain('function firstSentence(text)');
    expect(runtime).toContain('if (stage) stage.hidden = true;');
    expect(runtime).not.toContain('const readingSteps =');
    expect(runtime).not.toContain("sessionStorage.setItem('myeongha.readingHandoff.v1'");
    expect(runtime).toContain("chatLink.setAttribute('href', 'chat-hub.html')");
    expect(runtime).toContain('Do not promote');
    expect(runtime).toContain('Reading-to-Chat continuation claim');
    expect(runtime).not.toContain("chat.html?character=");
    expect(runtime).not.toContain("next.searchParams.set('reader', readerKey)");
    expect(runtime).not.toContain('presentationReaderHint: readerKey');
    expect(runtime).toContain("handoffUrl('records.html?tab=saju')");
    expect(html).toContain('대화를 시작하려면 대화 상대를 새로 선택해 주세요.');
    expect(html).toContain('data-reading-route-action href="reading.html"');
    expect(html).toContain('data-reading-chat-link href="chat-hub.html"');
    expect(html).toContain('대화 상대 선택');
    expect(html).not.toContain('과 이어서 대화');
    expect(html).toContain('data-reading-completion');
    expect(html).toContain('data-reading-chat-link');
    expect(html).toContain('data-reading-records-link');
  });

  it('reopens persisted Official Reading from Records without entering Reader Scene', async () => {
    const [runtime, handoff] = await Promise.all([
      readFile(readingRuntimePath, 'utf8'),
      readFile(readingHandoffPath, 'utf8'),
    ]);

    expect(runtime).toContain("from './official-reading-record-contract.js'");
    expect(runtime).toContain("const OFFICIAL_READING_RECORD_ENDPOINT = '/api/readings';");
    expect(runtime).toContain("endpoint.searchParams.set('readingId', persistedReadingHandoff.readingId)");
    expect(runtime).toContain('record.readingId !== persistedReadingHandoff.readingId');
    expect(runtime).toContain('record.readingSessionId !== persistedReadingHandoff.readingSessionId');
    expect(runtime).toContain('record.sajuDomain !== persistedReadingHandoff.sajuDomain');
    expect(runtime).toContain("activatePreviewReading({ ...readingView, source: 'record' })");
    expect(runtime).toContain("root.dataset.readingRouteState = isStoredRecord ? 'persisted_record' : 'preview'");
    expect(runtime).toContain("delete root.dataset.reader;");
    expect(runtime).toContain("delete root.dataset.readerSelection;");
    expect(runtime).toContain("delete root.dataset.readerAuthority;");
    expect(runtime).toContain("delete root.dataset.readerPresentation;");
    expect(runtime).toContain("document.querySelector('.reader-scene')?.setAttribute('hidden', '')");
    expect(runtime).toContain("stage.setAttribute('aria-label', '저장된 공식 사주 풀이')");
    expect(runtime).toContain('function configurePersistedReadingNavigation()');
    expect(runtime).toContain("backLink.setAttribute('href', 'records.html?tab=saju')");
    expect(runtime).toContain("backLink.textContent = '← 사주 기록으로 돌아가기'");
    expect(runtime).toContain("routeAction.setAttribute('href', 'records.html?tab=saju')");
    expect(runtime).toContain("routeAction.textContent = '사주 기록으로 돌아가기 →'");
    expect(runtime).toContain('function renderPersistedReadingFailure');
    expect(runtime).toContain('configurePersistedReadingNavigation();');
    expect(runtime).toContain("completionTitle.textContent = '저장된 공식 사주 풀이를 끝까지 확인했습니다.'");
    expect(runtime).toContain("'이 결과는 기록에 저장된 Official Reading입니다. 대화를 시작하려면 대화 상대를 새로 선택해 주세요.'");
    expect(runtime).not.toContain('renderPersistedReadingHandoffUnavailable');
    expect(handoff).toContain("PERSISTED_READING_HANDOFF_SOURCE_V1 = 'records'");
    expect(handoff).not.toContain('readerCharacterId');
    expect(handoff).not.toContain("params.set('threadId'");
  });

  it('renders the admitted calculation summary instead of shipping a fake chart placeholder', async () => {
    const [html, runtime] = await Promise.all([
      readReadingMarkup(),
      readFile(readingRuntimePath, 'utf8'),
    ]);

    expect(html).toContain('data-chart-pillar-year');
    expect(html).toContain('data-chart-pillar-month');
    expect(html).toContain('data-chart-pillar-day');
    expect(html).toContain('data-chart-pillar-hour');
    expect(html).toContain('data-chart-five-elements');
    expect(html).toContain('data-chart-ten-gods');
    expect(html).not.toContain('年柱');
    expect(html).not.toContain('실제 서비스에서는');
    expect(runtime).toContain('reading.calculationSummary');
    expect(runtime).toContain('renderCalculationSummary(preview.calculationSummary)');
    expect(runtime).toContain('displayFactValue(fact)');
  });

  it('provides desktop immersion and a mobile stacked reading adaptation', async () => {
    const css = await readFile(readingCssPath, 'utf8');

    expect(css).toContain('grid-template-columns: minmax(0, 1.03fr) minmax(560px, .97fr)');
    expect(css).toContain('@media (max-width: 900px)');
    expect(css).toContain('grid-template-columns: 1fr;');
    expect(css).toContain('@media (max-width: 767px)');
  });

  it('ships all nine Readers with a dedicated animated Reading Scene presentation', async () => {
    const [sceneCss, baekheonScene] = await Promise.all([
      readFile(readingScenesCssPath, 'utf8'),
      readFile(baekheonScenePath),
    ]);

    for (const key of ['baekheon', 'seyeon', 'yeoul', 'seorin', 'rahyeon', 'mira', 'taegyeom', 'yunho', 'doyun']) {
      expect(sceneCss).toContain(`body[data-reader="${key}"]`);
      if (key === 'doyun') expect(sceneCss).toContain('url("assets/characters/rooms/doyoon-room.webp")');
      else expect(sceneCss).toContain(`url("assets/characters/rooms/${key}-room.webp")`);
    }
    expect(sceneCss).toContain('body[data-reading-experience="entering"] .reader-scene-art');
    expect(sceneCss).toContain('body[data-reading-experience="reading"] .reader-scene-art');
    expect(sceneCss).toContain('body[data-reading-experience="complete"] .reader-scene-art');
    expect(sceneCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(baekheonScene.byteLength).toBeGreaterThan(10_000);
  });
});
