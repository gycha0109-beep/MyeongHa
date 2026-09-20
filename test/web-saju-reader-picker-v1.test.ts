import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const hallHtmlPath = new URL('../apps/web/hall.html', import.meta.url);
const readingHtmlPath = new URL('../apps/web/reading.html', import.meta.url);
const pickerRuntimePath = new URL('../apps/web/reading-reader-picker.js', import.meta.url);
const pickerCssPath = new URL('../apps/web/reading-reader-picker.css', import.meta.url);

describe('MyeongHa Saju Reader picker', () => {
  it('gates Home and Saju detail entry through a shared Reader picker', async () => {
    const [hall, reading, runtime, css] = await Promise.all([
      readFile(hallHtmlPath, 'utf8'),
      readFile(readingHtmlPath, 'utf8'),
      readFile(pickerRuntimePath, 'utf8'),
      readFile(pickerCssPath, 'utf8'),
    ]);

    for (const html of [hall, reading]) {
      expect(html).toContain('href="reading-reader-picker.css"');
      expect(html).toContain('src="reading-reader-picker.js"');
    }

    expect(runtime).toContain("const READING_DETAIL_PATH = '/reading-detail.html';");
    expect(runtime).toContain("next.searchParams.set('reader', readerKey);");
    expect(runtime).toContain("window.location.assign(next.href);");
    expect(runtime).toContain("dialog.showModal()");
    expect(runtime).toContain("reader.representativeDemo");
    expect(css).toContain('.reading-reader-picker-grid');
    expect(css).toContain('.reading-reader-option.is-demo');
  });

  it('offers the canonical nine Readers and keeps Baekheon as the representative visual demo', async () => {
    const runtime = await readFile(pickerRuntimePath, 'utf8');
    const keys = ['seyeon', 'baekheon', 'yeoul', 'seorin', 'rahyeon', 'mira', 'taegyeom', 'yunho', 'doyoon'];
    const names = ['세연', '백헌', '여울', '서린', '라현', '미라', '태겸', '윤호', '도윤'];

    for (const key of keys) {
      expect(runtime).toContain(`key: '${key}'`);
      expect(runtime).toContain(`assets/characters/${key}-portrait-v2.webp`);
    }
    for (const name of names) expect(runtime).toContain(`name: '${name}'`);

    expect(runtime).toContain('representativeDemo: true');
    expect(runtime).toContain('현재 대표 시연은 백헌의 장면까지 연결되어 있습니다.');
    expect(runtime).toContain('전용 장면과 챗봇 응답은 후속 연결됩니다.');
  });
});
