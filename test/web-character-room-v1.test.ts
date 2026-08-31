import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const chatHtmlPath = new URL('../apps/web/chat.html', import.meta.url);
const chatCssPath = new URL('../apps/web/chat-room.css', import.meta.url);
const chatRuntimePath = new URL('../apps/web/chat-character.js', import.meta.url);

describe('MyeongHa immersive Character Room v1', () => {
  it('replaces the legacy messenger demo with a focused visual-novel-like room', async () => {
    const html = await readFile(chatHtmlPath, 'utf8');

    expect(html).toContain('href="product.css"');
    expect(html).toContain('href="chat-room.css"');
    expect(html).toContain('class="character-room-stage"');
    expect(html).toContain('class="character-room-scene"');
    expect(html).toContain('class="character-dialogue-panel"');
    expect(html).toContain('class="character-composer"');
    expect(html).not.toContain('John Doe');
    expect(html).not.toContain('DEMO');
    expect(html).not.toContain('mobile-bottom-nav');
  });

  it('keeps the current relationship context visible without turning the room into a chat log', async () => {
    const html = await readFile(chatHtmlPath, 'utf8');

    expect(html).toContain('이어진 이야기 ·');
    expect(html).toContain('data-context-title');
    expect(html).toContain('data-history-open');
    expect(html).toContain('data-history-drawer');
    expect(html).toContain('이야기 이어가기');
  });

  it('supports every current character through one shared geometry runtime', async () => {
    const [runtime, css] = await Promise.all([
      readFile(chatRuntimePath, 'utf8'),
      readFile(chatCssPath, 'utf8'),
    ]);

    for (const key of ['baekheon', 'seyeon', 'yeoul', 'seorin', 'rahyeon', 'mira', 'taegyeom', 'yunho', 'doyoon']) {
      expect(runtime).toContain(`${key}: {`);
      expect(css).toContain(`body[data-character="${key}"]`);
    }

    for (const name of ['백헌', '세연', '여울', '서린', '라현', '미라', '태겸', '윤호', '도윤']) {
      expect(runtime).toContain(`name: '${name}'`);
    }

    expect(runtime).toContain("params.get('character') || 'baekheon'");
    expect(runtime).toContain('root.dataset.character = characterKey');
  });

  it('gives Baekheon a real scene asset while keeping Se-yeon a distinct warm atmosphere', async () => {
    const css = await readFile(chatCssPath, 'utf8');

    expect(css).toContain('url("baekheon-reading-scene.jpg")');
    expect(css).toContain('body[data-character="seyeon"] .character-room-scene');
    expect(css).toContain('#f3d8c6');
    expect(css).toContain('url("home-plum-branch.svg")');
  });

  it('does not fabricate an assistant response before the server chat runtime handles submission', async () => {
    const runtime = await readFile(chatRuntimePath, 'utf8');

    expect(runtime).toContain("new CustomEvent('myeongha:chat-submit'");
    expect(runtime).toContain('cancelable: true');
    expect(runtime).toContain('실제 응답은 서버 chat runtime 연결 후 표시됩니다.');
    expect(runtime).not.toContain('setTimeout');
  });

  it('adapts the same room into a mobile scene-over-dialogue stack', async () => {
    const css = await readFile(chatCssPath, 'utf8');

    expect(css).toContain('@media (max-width: 767px)');
    expect(css).toContain('min-height: 43svh');
    expect(css).toContain('flex: 0 0 43svh');
    expect(css).toContain('grid-template-columns: 1fr 56px');
  });
});
