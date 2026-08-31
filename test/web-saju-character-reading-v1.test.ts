import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readingHtmlPath = new URL('../apps/web/reading.html', import.meta.url);
const readingCssPath = new URL('../apps/web/reading-v3.css', import.meta.url);
const readingScenesCssPath = new URL('../apps/web/reading-scenes.css', import.meta.url);
const readingRuntimePath = new URL('../apps/web/reading-character.js', import.meta.url);
const baekheonScenePath = new URL('../apps/web/baekheon-reading-scene.jpg', import.meta.url);

describe('MyeongHa character-led Saju Reading v1', () => {
  it('uses the approved product shell and keeps Saju as the active destination', async () => {
    const html = await readFile(readingHtmlPath, 'utf8');

    expect(html).toContain('href="product.css"');
    expect(html).toContain('href="reading-v3.css"');
    expect(html).toContain('href="reading-scenes.css"');
    expect(html).toContain('href="reading.html" aria-current="page"');
    expect(html).toContain('class="reading-stage"');
    expect(html).toContain('class="reader-scene"');
    expect(html).toContain('class="reading-sheet"');
    expect(html).not.toContain('John Doe');
    expect(html).not.toContain('DEMO');
  });

  it('renders Reading authority before character expression and never labels character copy as engine truth', async () => {
    const html = await readFile(readingHtmlPath, 'utf8');

    const flow = html.indexOf('data-reading-step-title');
    const structure = html.indexOf('data-reading-structure-title');
    const character = html.indexOf('reading-character-block');

    expect(flow).toBeGreaterThan(-1);
    expect(structure).toBeGreaterThan(flow);
    expect(character).toBeGreaterThan(structure);
    expect(html).toContain('사주 의미는 검증된 Reading을 따르며, 캐릭터는 표현과 후속 질문만 담당합니다.');
    expect(html).toContain('Saju Engine이 확정한 구조적 근거와 적용 범위');
  });

  it('supports the fixed nine-character roster without coupling layout geometry to one reader', async () => {
    const [runtime, css] = await Promise.all([
      readFile(readingRuntimePath, 'utf8'),
      readFile(readingCssPath, 'utf8'),
    ]);

    for (const key of ['baekheon', 'seyeon', 'yeoul', 'seorin', 'rahyeon', 'mira', 'taegyeom', 'yunho', 'doyoon']) {
      expect(runtime).toContain(`${key}: {`);
      expect(css).toContain(`body[data-reader="${key}"]`);
    }

    for (const name of ['백헌', '세연', '여울', '서린', '라현', '미라', '태겸', '윤호', '도윤']) {
      expect(runtime).toContain(`['${name}',`);
    }

    expect(runtime).toContain("params.get('character') || params.get('reader')");
    expect(runtime).toContain('root.dataset.reader = readerKey');
    expect(runtime).toContain('data-reader-hanja');
  });

  it('keeps the reading as a fixed four-step progression with on-demand chart access', async () => {
    const [html, runtime] = await Promise.all([
      readFile(readingHtmlPath, 'utf8'),
      readFile(readingRuntimePath, 'utf8'),
    ]);

    expect((html.match(/data-reading-progress-dot/g) ?? []).length).toBe(4);
    expect(html).toContain('data-reading-next');
    expect(html).toContain('data-reading-prev');
    expect(html).toContain('data-chart-open');
    expect(html).toContain('data-chart-dialog');
    expect(html).toContain('내 명식 보기');
    expect(runtime).toContain("eyebrow: '읽기 1 / 4'");
    expect(runtime).toContain("eyebrow: '읽기 4 / 4'");
    expect(runtime).toContain("window.location.href = `chat.html?character=${encodeURIComponent(readerKey)}&from=reading`");
  });

  it('treats birth chart content as server-backed placeholder data rather than invented client claims', async () => {
    const html = await readFile(readingHtmlPath, 'utf8');

    expect(html).toContain('서버에서 확인된 Birth Profile revision과 Saju Engine 계산 결과만');
    expect(html).toContain('年柱');
    expect(html).toContain('月柱');
    expect(html).toContain('日柱');
    expect(html).toContain('時柱');
  });

  it('provides desktop immersion and a mobile stacked reading adaptation', async () => {
    const css = await readFile(readingCssPath, 'utf8');

    expect(css).toContain('grid-template-columns: minmax(0, 1.03fr) minmax(560px, .97fr)');
    expect(css).toContain('@media (max-width: 900px)');
    expect(css).toContain('grid-template-columns: 1fr;');
    expect(css).toContain('@media (max-width: 767px)');
  });

  it('ships Baekheon with an actual reading scene while leaving other characters asset-safe', async () => {
    const [sceneCss, baekheonScene] = await Promise.all([
      readFile(readingScenesCssPath, 'utf8'),
      readFile(baekheonScenePath),
    ]);

    expect(sceneCss).toContain('body[data-reader="baekheon"] .reader-scene-art');
    expect(sceneCss).toContain('url("baekheon-reading-scene.jpg")');
    expect(sceneCss).toContain('other readers keep the shared');
    expect(baekheonScene.byteLength).toBeGreaterThan(10_000);
  });
});
