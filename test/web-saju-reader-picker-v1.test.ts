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
    expect(runtime).toContain('현재 프리뷰에서는 사주 근거와 해석 문장은 그대로 유지하고');
    expect(runtime).toContain('선택한 Reader의 장면과 이름만 화면 연출에 적용합니다.');
    expect(css).toContain('.reading-reader-picker-grid');
  });

  it('offers nine browser presentation Reader options without promoting them to canonical identity', async () => {
    const runtime = await readFile(pickerRuntimePath, 'utf8');
    const keys = ['seyeon', 'baekheon', 'yeoul', 'seorin', 'rahyeon', 'mira', 'taegyeom', 'yunho', 'doyun'];
    const names = ['세연', '백헌', '여울', '서린', '라현', '미라', '태겸', '윤호', '도윤'];

    for (const key of keys) expect(runtime).toContain(`key: '${key}'`);
    for (const key of keys.filter((key) => key !== 'doyun')) {
      expect(runtime).toContain(`assets/characters/${key}-portrait-v2.webp`);
    }
    expect(runtime).toContain('assets/characters/doyoon-portrait-v2.webp');
    for (const name of names) expect(runtime).toContain(`name: '${name}'`);

    expect(runtime).not.toContain('representativeDemo: true');
    expect(runtime).toContain('이 선택은 프리뷰 화면 연출에만 적용됩니다.');
    expect(runtime).toContain('저장된 풀이를 다시 읽거나 대화를 이어가는 Reader는 서버에서 연결 가능한 상태가 확인된 뒤 별도로 표시됩니다.');
    expect(runtime).not.toContain('Reading이 끝난 뒤에는 선택한 Reader와 대화를 이어가거나');
    expect(runtime).not.toContain("fallback.searchParams.set('reader', 'baekheon')");
  });
});
