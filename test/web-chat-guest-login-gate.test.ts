import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const web = (path: string) => readFile(new URL('../apps/web/' + path, import.meta.url), 'utf8');

describe('Guest Character Room sign-in gate and dark avatar crop', () => {
  it('opens a real sign-in modal only for a missing Member session, with safe return navigation', async () => {
    const [page, html, auth, css] = await Promise.all([
      web('src/chat/ChatPage.tsx'), web('chat.html'), web('product-auth.js'), web('chat-login-gate.css'),
    ]);
    expect(page).toContain('readMemberSession()');
    expect(page).toContain('loginDialogRef.current');
    expect(page).toContain('dialog.showModal()');
    expect(page).toContain('dialog.close()');
    expect(page).toContain('onCancel={(event) => event.preventDefault()}');
    expect(page).toContain('data-chat-login-dialog');
    expect(page).toContain('auth.html?next=${encodeURIComponent(resumeChatHref)}');
    expect(page).toContain('href="chat-hub.html"');
    expect(page).toContain("window.addEventListener('myeongha:auth-changed'");
    expect(auth).toContain('export function readMemberSession()');
    expect(html).toContain('href="chat-login-gate.css"');
    expect(css).toContain('.chat-login-dialog::backdrop');
    expect(page).toContain("import('../../chat-runtime-client.js')");
  });

  it('crops Seyeon dark portrait without changing the source image or other themes', async () => {
    const theme = await web('product-theme.css');
    const start = theme.indexOf('html[data-theme="dark"] body.character-room-v2[data-character="seyeon"] .conversation-message-avatar[data-character="seyeon"] {');
    expect(start).toBeGreaterThan(0);
    const rule = theme.slice(start, theme.indexOf('}', start));
    expect(rule).toContain('seyeon-portrait-v2.webp');
    expect(rule).toContain('background-size: 142% auto;');
    expect(rule).toContain('background-position: center 22%;');
    expect(rule).toContain('background-repeat: no-repeat;');
  });
});
