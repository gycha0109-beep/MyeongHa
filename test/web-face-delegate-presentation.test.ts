import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const loadWeb = (name: string) =>
  readFile(new URL(`../apps/web/${name}`, import.meta.url), 'utf8');

describe('Face Reading 대리자 selection presentation', () => {
  it('uses the approved updated Yeoul and Mira portrait assets shared with Chat Hub', async () => {
    const [catalog, hub] = await Promise.all([
      loadWeb('reader-presentation-catalog.js'),
      loadWeb('chat-hub.js'),
    ]);

    for (const key of ['yeoul', 'mira']) {
      const portrait = `assets/characters/${key}-portrait-uploaded.svg`;
      expect(catalog).toContain(`portrait: '${portrait}'`);
      expect(hub).toContain(`src: '${portrait}'`);
      expect(catalog).not.toContain(`${key}-portrait-v2.webp`);
    }
    expect(catalog).toContain('export const READER_PRESENTATIONS');
    expect(catalog).toContain('do not grant Reader availability');
  });

  it('uses the same 대리자 dialog module as Saju without changing Face selection behavior', async () => {
    const [html, runtime, shared, saju] = await Promise.all([
      loadWeb('face-reading.html'), loadWeb('face-reading-shell.js'),
      loadWeb('reader-picker-dialog.js'), loadWeb('reading-reader-picker.js'),
    ]);
    for (const phrase of [
      '선택한 대리자', '대리자 변경', '대리자가 풀어드립니다',
      '선택한 대리자의 관점과 말투',
    ]) expect(html).toContain(phrase);

    expect(runtime).toContain("import { createDelegatePicker } from './reader-picker-dialog.js';");
    expect(saju).toContain("import { createDelegatePicker } from './reader-picker-dialog.js';");
    expect(runtime).toContain('관상 결과 자체는 대리자에 따라 바뀌지 않습니다.');
    expect(runtime).toContain('관상 · 대리자 선택');
    expect(runtime).toContain('이 대리자와 보기 →');
    expect(runtime).toContain('selectable: true');
    for (const phrase of [
      "'대리자 선택 닫기'",
      "kicker.textContent = '대리자'",
      '어떤 대리자와 함께 볼까요?',
      '이름이나 설명으로 대리자 찾기',
      "'대리자 검색'",
      '검색과 일치하는 대리자가 없습니다.',
    ]) expect(shared).toContain(phrase);

    for (const oldText of ['Reader 변경', 'SELECTED READER', '선택한 Reader', 'Reader가 풀어드립니다']) {
      expect(html).not.toContain(oldText);
    }
    expect(runtime).not.toContain('function createReaderPicker()');
    expect(saju).not.toContain('function createElement');
  });

  it('keeps internal Reader keys, selection URL, photo intake and guarded analysis unchanged', async () => {
    const [html, runtime, shared] = await Promise.all([
      loadWeb('face-reading.html'), loadWeb('face-reading-shell.js'), loadWeb('reader-picker-dialog.js'),
    ]);
    expect(runtime).toContain("url.searchParams.set('reader', readerKey)");
    expect(runtime).toContain('delegatePicker.open({ selectedKey: selectedReader.key })');
    expect(runtime).toContain('updateReaderUrl(reader.key)');
    expect(shared).toContain('image.src = reader.portrait');
    expect(html).toContain('data-face-reader-change');
    expect(runtime).toContain('analyze.disabled = true');
    expect(runtime).toContain('new FileReader()');
  });
});
