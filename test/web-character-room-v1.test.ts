import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const chatHtmlPath = new URL('../apps/web/chat.html', import.meta.url);
const chatCssPath = new URL('../apps/web/chat-room.css', import.meta.url);
const chatRuntimeCssPath = new URL('../apps/web/chat-runtime.css', import.meta.url);
const characterPresentationPath = new URL('../apps/web/chat-character.js', import.meta.url);
const transportPath = new URL('../apps/web/chat-runtime-client.js', import.meta.url);

describe('MyeongHa immersive Character Room v1', () => {
  it('keeps the focused visual-novel-like room and adds the runtime transport layer', async () => {
    const html = await readFile(chatHtmlPath, 'utf8');

    expect(html).toContain('href="product.css"');
    expect(html).toContain('href="chat-room.css"');
    expect(html).toContain('href="chat-runtime.css"');
    expect(html).toContain('class="character-room-stage"');
    expect(html).toContain('class="character-room-scene"');
    expect(html).toContain('class="character-dialogue-panel"');
    expect(html).toContain('class="character-composer"');
    expect(html).toContain('src="chat-character.js"');
    expect(html).toContain('src="chat-runtime-client.js"');
    expect(html).not.toContain('John Doe');
    expect(html).not.toContain('DEMO');
    expect(html).not.toContain('mobile-bottom-nav');
  });

  it('does not ship fabricated Life Thread or past-conversation claims in static room data', async () => {
    const [html, presentation] = await Promise.all([
      readFile(chatHtmlPath, 'utf8'),
      readFile(characterPresentationPath, 'utf8'),
    ]);

    expect(html).toContain('data-context-pill hidden');
    expect(html).toContain('data-history-list></div>');
    expect(html).toContain('data-history-empty');
    expect(html).not.toContain('퇴사를 고민했던 이야기');
    expect(html).not.toContain('남기로 결정했다고 이야기했습니다');

    expect(presentation).not.toContain('context:');
    expect(presentation).not.toContain('history:');
    expect(presentation).not.toContain('퇴사를 고민했던 이야기');
    expect(presentation).not.toContain('가족 이야기를 나눈 날');
  });

  it('supports every current character through one shared presentation geometry', async () => {
    const [presentation, css] = await Promise.all([
      readFile(characterPresentationPath, 'utf8'),
      readFile(chatCssPath, 'utf8'),
    ]);

    for (const key of ['baekheon', 'seyeon', 'yeoul', 'seorin', 'rahyeon', 'mira', 'taegyeom', 'yunho', 'doyoon']) {
      expect(presentation).toContain(`${key}: {`);
      expect(css).toContain(`body[data-character="${key}"]`);
    }

    for (const name of ['백헌', '세연', '여울', '서린', '라현', '미라', '태겸', '윤호', '도윤']) {
      expect(presentation).toContain(`name: '${name}'`);
    }

    expect(presentation).toContain("params.get('character') || 'baekheon'");
    expect(presentation).toContain('root.dataset.character = characterKey');
  });

  it('gives Baekheon a real scene asset while keeping Se-yeon a distinct warm atmosphere', async () => {
    const css = await readFile(chatCssPath, 'utf8');

    expect(css).toContain('url("baekheon-reading-scene.jpg")');
    expect(css).toContain('body[data-character="seyeon"] .character-room-scene');
    expect(css).toContain('#f3d8c6');
    expect(css).toContain('url("home-plum-branch.svg")');
  });

  it('hydrates only through same-origin runtime endpoints and sends presentation keys, never inferred canonical ids', async () => {
    const transport = await readFile(transportPath, 'utf8');

    expect(transport).toContain("new URL('/api/chat/thread', window.location.origin)");
    expect(transport).toContain("fetch('/api/chat/turn'");
    expect(transport).toContain("credentials: 'same-origin'");
    expect(transport).toContain("url.searchParams.set('presentationKey', characterKey)");
    expect(transport).toContain('presentationKey: characterKey');
    expect(transport).toContain('payload.presentationKey !== characterKey');
    expect(transport).not.toContain("url.searchParams.set('character', characterKey)");
    expect(transport).not.toContain('characterId: characterKey');
    expect(transport).not.toContain('supabase.co');
    expect(transport).not.toContain('sb_publishable_');
    expect(transport).not.toContain('service_role');
  });

  it('keeps failed submissions in the composer and does not fabricate a reply', async () => {
    const [presentation, transport] = await Promise.all([
      readFile(characterPresentationPath, 'utf8'),
      readFile(transportPath, 'utf8'),
    ]);

    expect(presentation).toContain("new CustomEvent('myeongha:chat-submit'");
    expect(presentation).toContain('cancelable: true');
    expect(presentation).not.toContain("messageInput.value = ''");
    expect(presentation).not.toContain('setTimeout');

    expect(transport).toContain('event.preventDefault()');
    expect(transport).toContain('메시지를 보내지 못했습니다. 입력한 내용은 그대로 남아 있습니다.');
    expect(transport).toContain("messageInput.value = ''");
  });

  it('keeps unverified continuation context hidden until an authority supplies it', async () => {
    const [runtimeCss, transport] = await Promise.all([
      readFile(chatRuntimeCssPath, 'utf8'),
      readFile(transportPath, 'utf8'),
    ]);

    expect(runtimeCss).toContain('.character-room-context[hidden]');
    expect(transport).toContain('contextPill.hidden = true');
    expect(transport).toContain('Life Thread / 이어지는 이야기 authority is intentionally not inferred');
  });

  it('adapts the same room into a mobile scene-over-dialogue stack', async () => {
    const css = await readFile(chatCssPath, 'utf8');

    expect(css).toContain('@media (max-width: 767px)');
    expect(css).toContain('min-height: 43svh');
    expect(css).toContain('flex: 0 0 43svh');
    expect(css).toContain('grid-template-columns: 1fr 56px');
  });
});
