import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { translateStaticUi } from '../apps/web/ui-i18n.js';

const web = resolve(process.cwd(), 'apps/web');
const read = (file: string) => readFileSync(resolve(web, file), 'utf8');
const locales = ['ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const;
const authoredChatFiles = [
  'chat-runtime-client.js',
  'chat-character.js',
  'chat-live-turn.js',
  'chat-open-client.js',
  'chat-room-read-contract.js',
  'chat-turn-receipt-client.js',
  'src/chat/ChatPage.tsx',
];

describe('All authored Chat errors and status notices have four-language copy', () => {
  it('covers every complete Korean text literal in active chat UI files', () => {
    let checked = 0;
    for (const file of authoredChatFiles) {
      const source = read(file);
      const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.JS);
      const visit = (node: ts.Node): void => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
          const value = node.text;
          // Single-character name/avatar marks are computed from canonical
          // localized character names; they are not user-visible sentences.
          if (/[가-힣]/u.test(value) && value.trim().length > 1) {
            checked += 1;
            const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
            for (const locale of locales) {
              const result = translateStaticUi(value, locale);
              expect(result, `${file}:${line} [${locale}] ${value}`).not.toBe(value);
              expect(result, `${file}:${line} [${locale}] ${value}`).not.toMatch(/[가-힣]/u);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(tree);
    }
    expect(checked).toBeGreaterThan(75);
  });

  it('covers the exact previously leaked safe-response failure in every locale', () => {
    const source = '세연의 안전한 응답 처리가 완료되지 않았습니다. 입력한 내용은 보존했습니다. 잠시 후 다시 시도해 주세요.';
    const fallback = '대화 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    for (const locale of locales) {
      expect(translateStaticUi(fallback, locale)).not.toBe(fallback);
      expect(translateStaticUi(fallback, locale)).not.toMatch(/[가-힣]/u);
    }
    expect(translateStaticUi(source, 'ko-KR')).toBe(source);
    for (const locale of locales) {
      expect(translateStaticUi(source, locale), locale).not.toBe(source);
      expect(translateStaticUi(source, locale), locale).not.toMatch(/[가-힣]/u);
    }
  });

  it('routes offline/unhandled Chat submission status through the same locale translator', () => {
    const source = read('chat-character.js');
    expect(source).toContain("composeStatus.textContent = translateStaticUi('현재 이 대화는 서버 연결이 준비되지 않았습니다. 입력한 내용은 보내지지 않았습니다.', getUiLocale())");
    const dictionary = read('ui-i18n.js');
    expect(dictionary).toContain("parent.closest('[data-compose-status], [data-room-loading]')");
    expect(dictionary).toContain('unmappedChatStatusSource.set(textNode, trimmed)');
    expect(dictionary).toContain('CHAT_STATUS_SAFE_FALLBACK');
  });

  it('keeps stored and delivered message bodies out of the status translation pipeline', () => {
    const live = read('chat-live-turn.js');
    const runtime = read('chat-runtime-client.js');
    expect(live).toContain('userContent.textContent = input.message');
    expect(live).toContain('paragraph.dataset.chatBodySource');
    expect(runtime).toContain('paragraph.textContent = message.bodyText');
    expect(runtime).toContain('composeStatus.textContent = uiText(message)');
  });
});

