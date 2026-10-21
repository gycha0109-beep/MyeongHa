import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readingUiCopyV1, readingUiProgressV1, readingUiReaderLineV1 } from '../reading-ui-locale.js';
describe('Reading experience UI locale boundary', () => {
  it('localizes fixed navigation and distinguishes saved official readings from previews', () => {
    expect(readingUiProgressV1(1, 4, 'ja-JP')).toBe('鑑定 2 / 4');
    expect(readingUiProgressV1(1, 4, 'zh-TW')).toBe('解讀 2 / 4');
    expect(readingUiCopyV1('읽기 마치기', 'ja-JP')).toBe('鑑定を終える');
    expect(readingUiCopyV1('기록 · 당시 저장된 공식 사주 풀이를 그대로 다시 읽고 있습니다.', 'zh-TW'))
      .toContain('正式八字解讀');
    expect(readingUiCopyV1('Preview · 현재 주제의 검증용 읽기이며 공식 기록에 저장되지 않습니다.', 'zh-TW'))
      .toContain('不會儲存');
  });
  it('does not translate or alter a server-owned interpretation title or unknown content', () => {
    const title = '生年月日 1980 / 개인적 기록';
    expect(readingUiReaderLineV1(title, 'ja-JP')).toContain(title);
    expect(readingUiReaderLineV1(title, 'zh-TW')).toContain(title);
    expect(readingUiCopyV1('사용자 제공 내용과 미검증 주장', 'zh-TW')).toBe('사용자 제공 내용과 미검증 주장');
  });
  it('preserves the official reading and evidence rendering assignments', () => {
    const code = readFileSync(new URL('../reading-character.js', import.meta.url), 'utf8');
    expect(code).toContain('stepTitle.textContent = step.title;');
    expect(code).toContain('stepBody.textContent = step.primary;');
    expect(code).toContain("structureParts.join('\\n\\n')");
    expect(code).toContain('if (preview.notice) authorityNote.title = preview.notice;');
  });
});
