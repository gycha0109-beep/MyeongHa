import { readFile, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const chatHtmlPath = new URL('../apps/web/chat.html', import.meta.url);
const chatPagePath = new URL('../apps/web/src/chat/ChatPage.tsx', import.meta.url);
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
    const [html, page] = await Promise.all([
      readFile(chatHtmlPath, 'utf8'),
      readFile(chatPagePath, 'utf8'),
    ]);
    const source = `${html}\n${page}`;

    expect(html).toContain('href="product.css"');
    expect(html).toContain('href="chat-room.css"');
    expect(html).toContain('href="chat-runtime.css"');
    expect(html).toContain('href="conversation-v2.css"');
    expect(html).toContain('src="/src/chat/main.tsx"');
    expect(source).toContain('className="character-room-stage conversation-room-stage"');
    expect(source).toContain('className="conversation-scene-column"');
    expect(source).toContain('className="character-dialogue-panel conversation-chat-panel"');
    expect(source).toContain('className="conversation-message-stream" data-chat-stream');
    expect(source).toContain('className="character-composer conversation-composer"');
    expect(page).toContain("import('../../chat-character.js')");
    expect(page).toContain("import('../../chat-runtime-client.js')");
    expect(await readFile(chatCssPath, 'utf8')).toContain('.character-composer .sr-only');
    expect(source).not.toContain('John Doe');
    expect(source).not.toContain('DEMO');
    expect(source).not.toContain('mobile-bottom-nav');
    expect(html).not.toContain('data-character="baekheon"');
    expect(page).not.toContain('>백헌<');
    expect(page).not.toContain('충추원의 장');
    expect(page).toContain('data-character-name>대화 상대</strong>');
    expect(page).toContain('data-character-title>서버 확인 중</span>');
    expect(page).toContain('data-dialogue-line>대화 상대를 확인하고 있습니다.</p>');
  });

  it('does not ship fabricated Life Thread or past-conversation claims in static room data', async () => {
    const [html, page, presentation] = await Promise.all([
      readFile(chatHtmlPath, 'utf8'),
      readFile(chatPagePath, 'utf8'),
      readFile(characterPresentationPath, 'utf8'),
    ]);
    const source = `${html}\n${page}`;

    expect(source).toContain('data-context-pill hidden');
    expect(source).toContain('data-thread-bar hidden');
    expect(source).toContain('data-history-list />');
    expect(source).toContain('data-history-empty');
    expect(source).not.toContain('퇴사를 고민했던 이야기');
    expect(source).not.toContain('남기로 결정했다고 이야기했습니다');

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

    for (const key of ['baekheon', 'seyeon', 'yeoul', 'seorin', 'rahyeon', 'mira', 'taegyeom', 'yunho', 'doyun']) {
      expect(presentation).toContain(`${key}: {`);
      expect(baseCss).toContain(`body[data-character="${key}"]`);
    }

    for (const name of ['백헌', '세연', '여울', '서린', '라현', '미라', '태겸', '윤호', '도윤']) {
      expect(presentation).toContain(`name: '${name}'`);
    }

    expect(presentation).toContain("const rawThreadId = params.get('threadId')");
    expect(presentation).toContain('const threadId = parseChatThreadIdV1(rawThreadId)');
    expect(presentation).toContain("const requestedCharacter = params.get('character')?.toLowerCase() ?? null");
    expect(presentation).toContain('const presentationCharacterKey = !hasThreadRoute && requestedCharacter');
    expect(presentation).toContain("presentationCharacterKey ?? (hasThreadRoute ? null : 'baekheon')");
    expect(presentation).toContain("'thread_identity_pending'");
    expect(presentation).toContain("'thread_identity_invalid'");
    expect(presentation).toContain("root.dataset.characterAuthority = 'presentation_hint_only'");
    expect(presentation).toContain('root.dataset.character = characterKey');
    expect(presentation).toContain("sceneLabel: '세연의 봄날 산책 공간'");
    expect(conversationCss).toContain('.character-room-v2[data-character="seyeon"] .conversation-room-scene');
    expect(conversationCss).toContain('url("seyeon-chat.webp")');
    expect(asset.size).toBeGreaterThan(10_000);

    for (const key of ['baekheon', 'yeoul', 'seorin', 'rahyeon', 'mira', 'taegyeom', 'yunho', 'doyun']) {
      expect(conversationCss).not.toContain(`.character-room-v2[data-character="${key}"] .conversation-room-scene {\n  background-image:`);
    }
  });

  it('hydrates both history and the visible chat stream from the canonical authoritative read route', async () => {
    const [transport, apiContract] = await Promise.all([
      readFile(transportPath, 'utf8'),
      readFile(apiContractPath, 'utf8'),
    ]);

    expect(apiContract).toContain('### `GET /api/chat/:threadId`');
    expect(transport).toContain('getActiveBearer');
    expect(transport).toContain("from './product-auth.js'");
    expect(transport).toContain('const activeBearer = await getActiveBearer()');
    expect(transport).toContain('Authorization: `Bearer ${activeBearer.token}`');
    expect(transport).toContain("new URL(`/api/chat/${encodeURIComponent(threadId)}`, window.location.origin)");
    expect(transport).toContain("credentials: 'same-origin'");
    expect(transport).toContain("cache: 'no-store'");
    expect(transport).toContain("url.searchParams.set('afterSequenceNo', '0')");
    expect(transport).not.toContain("url.searchParams.set('presentationKey'");
    expect(transport).not.toContain('payload.presentationKey');
    expect(transport).toContain("import('./api-envelope.js')");
    expect(transport).toContain('unwrapApiSuccessEnvelope(envelope)');
    expect(transport).toContain('renderHistory(state.messages, state.characterId)');
    expect(transport).toContain('renderConversation(state.messages, state.characterId)');
    expect(transport).toContain("article.className = 'conversation-message'");
    expect(transport).not.toContain("new URL('/api/chat/thread', window.location.origin)");
    expect(transport).not.toContain("url.searchParams.set('character', characterKey)");
    expect(transport).not.toContain('supabase.co');
    expect(transport).not.toContain('sb_publishable_');
    expect(transport).not.toContain('service_role');
  });

  it('projects thread-bound canonical Character identity through the approved exact-name mapping', async () => {
    const [presentation, transport] = await Promise.all([
      readFile(characterPresentationPath, 'utf8'),
      readFile(transportPath, 'utf8'),
    ]);

    expect(transport).toContain('applyCanonicalCharacterPresentationV1(state.characterId)');
    expect(transport).toContain('resolveCanonicalCharacterPresentationV1(message.characterId)');
    expect(transport).toContain('renderHistory(state.messages, state.characterId)');
    expect(transport).toContain('renderConversation(state.messages, state.characterId)');
    expect(transport).not.toContain('presentationKey: state.characterId');
    expect(presentation).toContain("root.dataset.characterAuthority = 'canonical_character_id'");
    expect(presentation).toContain("presentationCharacterKey ?? (hasThreadRoute ? null : 'baekheon')");
    expect(presentation).toContain("'thread_identity_pending'");
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
    expect(presentation).toContain('detail: Object.freeze({ message: value })');
    expect(presentation).not.toContain('detail: Object.freeze({ characterKey, message: value })');
    expect(presentation).not.toContain("messageInput.value = ''");
    expect(presentation).not.toContain('setTimeout');
    expect(presentation).not.toContain('setDialogueText(text)');
    expect(transport).not.toContain('window.MyeongHaCharacterRoom');

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
