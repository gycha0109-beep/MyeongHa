import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFile(new URL('../apps/web/' + path, import.meta.url), 'utf8');

describe('Web chat composer keyboard handling', () => {
  it('routes plain Enter through the existing form submit path, never directly to transport', async () => {
    const [runtime, page] = await Promise.all([
      source('chat-character.js'),
      source('src/chat/ChatPage.tsx'),
    ]);
    expect(page).toContain('data-message-input');
    expect(page).toContain('data-composer');
    expect(page).toContain('type="submit"');
    expect(runtime).toContain("messageInput?.addEventListener('keydown', (event) => {");
    expect(runtime).toContain("event.key !== 'Enter'");
    expect(runtime).toContain('event.preventDefault()');
    expect(runtime).toContain('if (!messageInput.value.trim()) return;');
    expect(runtime).toContain('composer?.requestSubmit()');
    expect(runtime).toContain("composer?.addEventListener('submit', (event) => {");
    expect(runtime).toContain("new CustomEvent('myeongha:chat-submit'");
    expect(runtime).not.toContain('sendTurn(');
    expect(runtime).not.toContain('window.location.reload()');
  });

  it('keeps Shift+Enter and modified keys as native text editing, excluding active IME confirmation', async () => {
    const runtime = await source('chat-character.js');
    expect(runtime).toContain('event.shiftKey || event.ctrlKey || event.altKey || event.metaKey');
    expect(runtime).toContain("messageInput?.addEventListener('compositionstart'");
    expect(runtime).toContain("messageInput?.addEventListener('compositionend'");
    expect(runtime).toContain('event.isComposing || messageCompositionActive || event.keyCode === 229');
    expect(runtime.indexOf('event.isComposing || messageCompositionActive')).toBeLessThan(runtime.indexOf('event.preventDefault();\n  if (!messageInput.value.trim())'));
  });
});
