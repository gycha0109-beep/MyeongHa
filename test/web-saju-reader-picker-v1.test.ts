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
    expect(runtime).toContain("9명의 Reader 모두 전용 Reading Scene까지 연결되어 있습니다.");
    expect(css).toContain('.reading-reader-picker-grid');
  });

  it('offers the canonical nine Readers with Reading Scene v1 available for every Reader', async () => {
    const runtime = await readFile(pickerRuntimePath, 'utf8');
    const keys = ['seyeon', 'baekheon', 'yeoul', 'seorin', 'rahyeon', 'mira', 'taegyeom', 'yunho', 'doyoon'];
    const names = ['세연', '백헌', '여울', '서린', '라현', '미라', '태겸', '윤호', '도윤'];

    for (const key of keys) {
      expect(runtime).toContain(`key: '${key}'`);
      expect(runtime).toContain(`assets/characters/${key}-portrait-v2.webp`);
    }
    for (const name of names) expect(runtime).toContain(`name: '${name}'`);

    expect(runtime).not.toContain('representativeDemo: true');
    expect(runtime).toContain('9명의 Reader 모두 전용 Reading Scene까지 연결되어 있습니다.');
    expect(runtime).toContain('Reading이 끝난 뒤에는 선택한 Reader와 대화를 이어가거나 기록에서 결과를 다시 볼 수 있습니다.');
    expect(runtime).toContain('챗봇 응답 연결은 후속 단계입니다.');
  });
});
