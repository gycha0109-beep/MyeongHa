import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const loadWeb = (name: string) => readFile(new URL('../apps/web/' + name, import.meta.url), 'utf8');

describe('MyeongHa Saju 대리자 picker', () => {
  it('routes Saju links through the common dialog but preserves preview gating', async () => {
    const [hall, reading, runtime, shared, css] = await Promise.all([
      loadWeb('hall.html'),
      loadWeb('reading.html'),
      loadWeb('reading-reader-picker.js'),
      loadWeb('reader-picker-dialog.js'),
      loadWeb('reading-reader-picker.css'),
    ]);
    for (const html of [hall, reading]) {
      expect(html).toContain('href="reading-reader-picker.css"');
      expect(html).toContain('src="reading-reader-picker.js"');
    }
    expect(runtime).toContain("import { createDelegatePicker } from './reader-picker-dialog.js';");
    expect(runtime).toContain("const READING_DETAIL_PATH = '/reading-detail.html';");
    expect(runtime).toContain("next.searchParams.set('reader', reader.key);");
    expect(runtime).toContain("window.location.assign(next.href);");
    expect(runtime).toContain('readerRolloutPresentationV1(reader.key).previewSelectable');
    expect(runtime).toContain('selectable: rollout.previewSelectable');
    expect(runtime).toContain('현재 세연만 프리뷰 장면을 선택할 수 있습니다.');
    expect(runtime).toContain('이 선택은 프리뷰 화면 연출에만 적용됩니다.');
    expect(runtime).toContain('저장된 풀이를 다시 읽거나 대화를 이어가는 대리자는 서버에서 연결 가능한 상태가 확인된 뒤 별도로 표시됩니다.');
    expect(runtime).not.toContain('공개된 유료 대리자 해석');
    expect(shared).toContain("button.disabled = optionState.selectable === false;");
    expect(shared).toContain('if (!(button instanceof HTMLButtonElement) || button.disabled) return;');
    expect(shared).toContain("typeof dialog.showModal === 'function'");
    expect(css).toContain('.reading-reader-picker-grid');
  });

  it('uses the same nine browser-only portraits and public 대리자 copy', async () => {
    const [runtime, catalog, shared] = await Promise.all([
      loadWeb('reading-reader-picker.js'), loadWeb('reader-presentation-catalog.js'), loadWeb('reader-picker-dialog.js'),
    ]);
    const keys = ['seyeon','baekheon','yeoul','seorin','rahyeon','mira','taegyeom','yunho','doyun'];
    const names = ['세연','백헌','여울','서린','라현','미라','태겸','윤호','도윤'];

    for (const key of keys) expect(catalog).toContain(`key: '${key}'`);
    for (const name of names) expect(catalog).toContain(`name: '${name}'`);
    for (const key of keys.filter((key) => !['doyun','yeoul','mira'].includes(key))) {
      expect(catalog).toContain(`assets/characters/${key}-portrait-v2.webp`);
    }
    expect(catalog).toContain('assets/characters/doyoon-portrait-v2.webp');
    expect(catalog).toContain('assets/characters/yeoul-portrait-uploaded.svg');
    expect(catalog).toContain('assets/characters/mira-portrait-uploaded.svg');
    expect(catalog).not.toContain('representativeDemo: true');
    expect(shared).toContain("kicker.textContent = '대리자'");
    expect(shared).toContain('어떤 대리자와 함께 볼까요?');
    expect(shared).toContain("search.placeholder = '이름이나 설명으로 대리자 찾기'");
    expect(runtime).toContain('선택한 대리자의 장면과 이름만 화면 연출에 적용합니다.');
    expect(runtime).not.toContain('선택한 Reader');
    expect(runtime).not.toContain("fallback.searchParams.set('reader', 'baekheon')");
  });
});
