import { readFile, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const chatHtmlPath = new URL('../apps/web/chat.html', import.meta.url);
const chatCssPath = new URL('../apps/web/chat-room.css', import.meta.url);
const chatRuntimeCssPath = new URL('../apps/web/chat-runtime.css', import.meta.url);
const conversationCssPath = new URL('../apps/web/conversation-v2.css', import.meta.url);
const seyeonAssetPath = new URL('../apps/web/seyeon-chat.webp', import.meta.url);
const characterPresentationPath = new URL('../apps/web/chat-character.js', import.meta.url);
const transportPath = new URL('../apps/web/chat-runtime-client.js', import.meta.url);
const chatRequestContractPath = new URL('../packages/contracts/src/chat-request.ts', import.meta.url);
const apiContractPath = new URL('../docs/API_CONTRACT.md', import.meta.url);

describe('MyeongHa immersive long-form Character Room', () => {
  it('combines an immersive character scene with a practical conversation stream', async () => {
    const html = await readFile(chatHtmlPath, 'utf8');

    expect(html).toContain('href="product.css"');
    expect(html).toContain('href="chat-room.css"');
    expect(html).toContain('href="chat-runtime.css"');
    expect(html).toContain('href="conversation-v2.css"');
    expect(html).toContain('class="character-room-stage conversation-room-stage"');
    expect(html).toContain('class="conversation-scene-column"');
    expect(html).toContain('class="character-dialogue-panel conversation-chat-panel"');
    expect(html).toContain('class="conversation-message-stream" data-chat-stream');
    expect(html).toContain('class="character-composer conversation-composer"');
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
    expect(html).toContain('data-thread-bar hidden');
    expect(html).toContain('data-history-list></div>');
    expect(html).toContain('data-history-empty');
    expect(html).not.toContain('퇴사를 고민했던 이야기');
    expect(html).not.toContain('남기로 결정했다고 이야기했습니다');

    expect(presentation).not.toContain('context:');
    expect(presentation).not.toContain('history:');
    expect(presentation).not.toContain('퇴사를 고민했던 이야기');
    expect(presentation).not.toContain('가족 이야기를 나눈 날');
  });

  it('supports every current character through shared geometry while giving only Se-yeon the approved uploaded asset', async () => {
    const [presentation, baseCss, conversationCss, asset] = await Promise.all([
      readFile(characterPresentationPath, 'utf8'),
      readFile(chatCssPath, 'utf8'),
      readFile(conversationCssPath, 'utf8'),
      stat(seyeonAssetPath),
    ]);

    for (const key of ['baekheon', 'seyeon', 'yeoul', 'seorin', 'rahyeon', 'mira', 'taegyeom', 'yunho', 'doyoon']) {
      expect(presentation).toContain(`${key}: {`);
      expect(baseCss).toContain(`body[data-character="${key}"]`);
    }

    for (const name of ['백헌', '세연', '여울', '서린', '라현', '미라', '태겸', '윤호', '도윤']) {
      expect(presentation).toContain(`name: '${name}'`);
    }

    expect(presentation).toContain("params.get('character') || 'baekheon'");
    expect(presentation).toContain('root.dataset.character = characterKey');
    expect(presentation).toContain("sceneLabel: '세연의 봄날 산책 공간'");
    expect(conversationCss).toContain('.character-room-v2[data-character="seyeon"] .conversation-room-scene');
    expect(conversationCss).toContain('url("seyeon-chat.webp")');
    expect(asset.size).toBeGreaterThan(10_000);

    for (const key of ['baekheon', 'yeoul', 'seorin', 'rahyeon', 'mira', 'taegyeom', 'yunho', 'doyoon']) {
      expect(conversationCss).not.toContain(`.character-room-v2[data-character="${key}"] .conversation-room-scene {\n  background-image:`);
    }
  });

  it('hydrates both history and the visible chat stream from the canonical authoritative read route', async () => {
    const [transport, apiContract] = await Promise.all([
      readFile(transportPath, 'utf8'),
      readFile(apiContractPath, 'utf8'),
    ]);

    expect(apiContract).toContain('### `GET /api/chat/:threadId`');
    expect(transport).toContain("new URL(`/api/chat/${encodeURIComponent(threadId)}`, window.location.origin)");
    expect(transport).toContain("credentials: 'same-origin'");
    expect(transport).toContain("cache: 'no-store'");
    expect(transport).toContain("url.searchParams.set('afterSequenceNo', '0')");
    expect(transport).toContain("url.searchParams.set('presentationKey', characterKey)");
    expect(transport).toContain("import('./api-envelope.js')");
    expect(transport).toContain('unwrapApiSuccessEnvelope(envelope)');
    expect(transport).toContain('payload.presentationKey !== characterKey');
    expect(transport).toContain('renderHistory(state.messages, state.characterId)');
    expect(transport).toContain('renderConversation(state.messages, state.characterId)');
    expect(transport).toContain("article.className = 'conversation-message'");
    expect(transport).not.toContain("new URL('/api/chat/thread', window.location.origin)");
    expect(transport).not.toContain("url.searchParams.set('character', characterKey)");
    expect(transport).not.toContain('supabase.co');
    expect(transport).not.toContain('sb_publishable_');
    expect(transport).not.toContain('service_role');
  });

  it('fails chat mutation closed instead of inventing a client capability or canonical character authority', async () => {
    const [transport, requestContract, apiContract] = await Promise.all([
      readFile(transportPath, 'utf8'),
      readFile(chatRequestContractPath, 'utf8'),
      readFile(apiContractPath, 'utf8'),
    ]);

    expect(apiContract).toContain('### `POST /api/chat`');
    expect(apiContract).toContain('### `GET /api/capabilities`');
    expect(apiContract).toContain('Character/thread resolution은 server가 한다.');
    expect(requestContract).toContain('readonly clientCapability: string;');
    expect(requestContract).toContain('readonly characterId?: string;');

    expect(transport).toContain('ChatRequestV1 requires clientCapability');
    expect(transport).toContain('현재 메시지를 보낼 수 없습니다. 입력한 내용은 그대로 남아 있습니다.');
    expect(transport).not.toContain("fetch('/api/chat/turn'");
    expect(transport).not.toContain("method: 'POST'");
    expect(transport).not.toContain('presentationKey: characterKey');
    expect(transport).not.toContain('characterId: characterKey');
    expect(transport).not.toContain('clientCapability:');
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
    expect(transport).toContain('현재 메시지를 보낼 수 없습니다. 입력한 내용은 그대로 남아 있습니다.');
    expect(transport).not.toContain("messageInput.value = ''");
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

  it('adapts the room into a compact scene-over-scrollable-chat mobile layout', async () => {
    const css = await readFile(conversationCssPath, 'utf8');

    expect(css).toContain('@media (max-width: 900px)');
    expect(css).toContain('grid-template-rows: 190px minmax(0,1fr)');
    expect(css).toContain('.conversation-message-stream');
    expect(css).toContain('overflow-y: auto');
    expect(css).toContain('.conversation-composer');
    expect(css).toContain('@media (max-width: 640px)');
    expect(css).toContain('grid-template-rows: 166px minmax(0,1fr)');
  });
});
