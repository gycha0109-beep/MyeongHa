import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const hubHtmlPath = new URL('../apps/web/chat-hub.html', import.meta.url);
const hubPagePath = new URL('../apps/web/src/chat-hub/ChatHubPage.tsx', import.meta.url);
const hubCssPath = new URL('../apps/web/chat-hub.css', import.meta.url);
const hubV2CssPath = new URL('../apps/web/conversation-v2.css', import.meta.url);
const hubJsPath = new URL('../apps/web/chat-hub.js', import.meta.url);
const roomHtmlPath = new URL('../apps/web/chat.html', import.meta.url);
const roomPagePath = new URL('../apps/web/src/chat/ChatPage.tsx', import.meta.url);
const roomRuntimePath = new URL('../apps/web/chat-character.js', import.meta.url);
const homeHtmlPath = new URL('../apps/web/hall.html', import.meta.url);
const homePagePath = new URL('../apps/web/src/home/HomePage.tsx', import.meta.url);
const readingHtmlPath = new URL('../apps/web/reading.html', import.meta.url);
const recordsHtmlPath = new URL('../apps/web/records.html', import.meta.url);

describe('MyeongHa conversation hub relationship-first IA', () => {
  it('puts ongoing relationships before character discovery', async () => {
    const [html, page] = await Promise.all([readFile(hubHtmlPath, 'utf8'), readFile(hubPagePath, 'utf8')]);
    const source = `${html}\n${page}`;

    const primary = source.indexOf('className="chat-hub-primary conversation-primary"');
    const myConversations = source.indexOf('내 대화');
    const incoming = source.indexOf('나에게 온 이야기');
    const discoverySection = source.indexOf('id="people"');

    expect(primary).toBeGreaterThan(-1);
    expect(myConversations).toBeGreaterThan(primary);
    expect(incoming).toBeGreaterThan(myConversations);
    expect(discoverySection).toBeGreaterThan(incoming);
    expect(source).toContain('누구와 이야기를 이어갈까요?');
    expect(source).toContain('지금 이어갈 사람');
    expect(source).toContain('data-incoming-section hidden');
    expect(source).not.toContain('<h2 id="recent-title">최근 대화</h2>');
  });

  it('fails closed instead of fabricating a relationship, recent thread, or incoming story', async () => {
    const [html, page, js] = await Promise.all([
      readFile(hubHtmlPath, 'utf8'),
      readFile(hubPagePath, 'utf8'),
      readFile(hubJsPath, 'utf8'),
    ]);
    const source = `${html}\n${page}`;

    expect(source).toContain('아직 이어지고 있는 대화가 없습니다.');
    expect(source).toContain('아직 이어지고 있는 관계가 없습니다.');
    expect(source).not.toContain('퇴사를 고민했던 이야기');
    expect(source).not.toContain('지난번 당신');
    expect(js).toContain('setContinuation(null)');
    expect(js).toContain('setRecent([])');
    expect(js).toContain('setIncoming([])');
    expect(js).toContain('window.MyeongHaChatHub = Object.freeze({ people })');
    expect(js).not.toContain('setRelationshipState(state = {})');
    expect(js).not.toContain('clearRelationshipState()');
    expect(js).toContain('typeof state.threadTitle');
    expect(js).toContain('item.hasIncoming === true');
    expect(js).not.toContain('threadTitle:');
    expect(js).not.toContain('hasIncoming: true');
  });

  it('keeps thread-backed relationship surfaces presentation-neutral until an owner-scoped server projection supplies canonical Character authority', async () => {
    const js = await readFile(hubJsPath, 'utf8');

    expect(js).toContain("import { parseChatThreadIdV1 } from './chat-room-read-contract.js'");
    expect(js).toContain('const threadId = parseChatThreadIdV1(state.threadId)');
    expect(js).toContain('const threadId = parseChatThreadIdV1(item?.threadId)');
    expect(js).toContain("const name = '대화 상대'");
    expect(js).toContain("continuationTitle.textContent = '서버 확인 중'");
    expect(js).toContain('continuationLink.href = roomHref(null, threadId)');
    expect(js).toContain('delete continuationScene.dataset.character');
    expect(js).toContain('link.href = roomHref(null, threadId)');
    expect(js).not.toContain('link.dataset.character = characterKey');
    expect(js).not.toContain('avatar.dataset.character = characterKey');
    expect(js).not.toContain('art.dataset.character = characterKey');
  });

  it('keeps discovery Character Room access presentation-only until authoritative Member thread open is publish-ready', async () => {
    const js = await readFile(hubJsPath, 'utf8');

    expect(js).toContain('action.href = roomHref(person.key)');
    expect(js).toContain('action.dataset.chatPreviewCharacter = person.key');
    expect(js).toContain("url.searchParams.set('character', safeKey)");
    expect(js).not.toContain("from './chat-open-client.js'");
    expect(js).not.toContain('createChatOpenClientV1()');
    expect(js).not.toContain('openForCanonicalCharacter({');
    expect(js).not.toContain('openDiscoveryCharacter');
    expect(js).not.toContain("event.preventDefault()");
    expect(js).not.toContain('characterId: person.key');
    expect(js).not.toContain('subjectId: person');
    expect(js).not.toContain('releaseId: person');
    expect(js).not.toContain('bundleId: person');
  });

  it('keeps discovery searchable and pageable without inventing canonical character authority', async () => {
    const js = await readFile(hubJsPath, 'utf8');

    expect(js).toContain('const PAGE_SIZE = 9');
    expect(js).toContain('data-people-search');
    expect(js).toContain('visibleCount + PAGE_SIZE');
    expect(js).toContain('safePresentationKey');
    expect(js).toContain("url.searchParams.set('character', safeKey)");
    expect(js).toContain("url.searchParams.set('threadId', safeThreadId)");
    expect(js).toContain('action.href = roomHref(person.key)');
    expect(js).toContain("if (!safeKey) return 'chat.html'");
    expect(js).not.toContain('characterId: person.key');
    expect(js).not.toContain('subjectId: person');
    expect(js).not.toContain('releaseId: person');
    expect(js).not.toContain('bundleId: person');
  });

  it('keeps legacy Se-yeon scene art out of cards and pins all nine presentation card portraits', async () => {
    const [v2Css, hubCss, js] = await Promise.all([
      readFile(hubV2CssPath, 'utf8'),
      readFile(hubCssPath, 'utf8'),
      readFile(hubJsPath, 'utf8'),
    ]);

    expect(v2Css).not.toContain('.chat-person-art[data-character="seyeon"]');
    expect(v2Css).toContain('.chat-incoming-art[data-character="seyeon"]');
    expect(v2Css).toContain('.chat-recent-avatar[data-character="seyeon"]');
    expect(v2Css).toContain('url("seyeon-chat.webp")');

    for (const key of ['seyeon', 'baekheon', 'seorin', 'rahyeon', 'taegyeom', 'yunho']) {
      expect(js).toContain(`${key}: Object.freeze({ src: 'assets/characters/${key}-portrait-v2.webp'`);
    }
    expect(js).toContain("yeoul: Object.freeze({ src: 'assets/characters/yeoul-portrait-uploaded.svg'");
    expect(js).toContain("mira: Object.freeze({ src: 'assets/characters/mira-portrait-uploaded.svg'");
    expect(js).toContain("doyun: Object.freeze({ src: 'assets/characters/doyoon-portrait-v2.webp'");

    expect(js).toContain("image.className = 'chat-person-art-image'");
    expect(hubCss).toContain('background-image: none !important');
    expect(hubCss).toContain('.chat-person-art-image');
    expect(hubCss).not.toContain('--portrait-scale');
    expect(hubCss).not.toContain('transform: scale(var(--portrait-scale');
    expect(js).not.toContain('portrait.position');
    expect(js).not.toContain('portrait.scale');
    expect(js).not.toContain('portrait.origin');
    expect(hubCss).toContain('html[data-theme="dark"] body.chat-hub-page .chat-person-tag');
  });

  it('maps all nine presentation characters to representative room art', async () => {
    const v2Css = await readFile(hubV2CssPath, 'utf8');

    for (const key of ['seyeon', 'baekheon', 'yeoul', 'seorin', 'rahyeon', 'mira', 'taegyeom', 'yunho', 'doyun']) {
      expect(v2Css).toContain(`.character-room-v2[data-character="${key}"]`);
    }
    for (const key of ['seyeon', 'baekheon', 'seorin', 'rahyeon', 'taegyeom', 'yunho']) {
      expect(v2Css).toContain(`assets/characters/rooms/${key}-room.webp`);
    }
    expect(v2Css).toContain('assets/characters/rooms/yeoul-room-uploaded.svg');
    expect(v2Css).toContain('assets/characters/rooms/mira-room-uploaded.svg');
    expect(v2Css).toContain('assets/characters/rooms/doyoon-room.webp');

    expect(v2Css).toContain('var(--conversation-room-art)');
    expect(v2Css).toContain('.conversation-room-scene .character-room-scene-decoration');
    expect(v2Css).toContain('[data-character-avatar]');
  });

  it('keeps character rooms as focused destinations and routes global conversation entries through the hub', async () => {
    const [roomHtml, roomPage, homeHtml, homePage, reading, records] = await Promise.all([
      readFile(roomHtmlPath, 'utf8'),
      readFile(roomPagePath, 'utf8'),
      readFile(homeHtmlPath, 'utf8'),
      readFile(homePagePath, 'utf8'),
      readFile(readingHtmlPath, 'utf8'),
      readFile(recordsHtmlPath, 'utf8'),
    ]);
    const room = `${roomHtml}\n${roomPage}`;
    const home = `${homeHtml}\n${homePage}`;

    expect(room).toContain('class="product-page character-room character-room-v2"');
    expect(room).toContain('href="chat-hub.html" aria-current="page"');
    expect(room).not.toContain('conversation-room-header');
    expect(room).not.toContain('대화로 돌아가기');
    expect(home).toContain('href="chat-hub.html">대화</a>');
    expect(home).toContain('href="chat-hub.html">대화로 가기 →</a>');
    expect(reading).toContain('href="chat-hub.html">대화</a>');
    expect(records).toContain('href="chat-hub.html">대화</a>');
  });

  it('rejects the legacy client-authored Saju Reading continuation claim', async () => {
    const runtime = await readFile(roomRuntimePath, 'utf8');

    expect(runtime).not.toContain('myeongha.readingHandoff.v1');
    expect(runtime).not.toContain("params.get('from') !== 'reading'");
    expect(runtime).not.toContain("root.dataset.chatEntry = 'reading-handoff'");
    expect(runtime).not.toContain('readingHandoff');
    expect(runtime).not.toContain('읽기에서 이어왔군요.');
    expect(runtime).toContain('setDialogueLines(character.intro)');
  });

  it('keeps thread-only Chat navigation identity-neutral until server presentation authority exists', async () => {
    const runtime = await readFile(roomRuntimePath, 'utf8');

    expect(runtime).toContain('const threadRoute = parseChatThreadRouteV1(params)');
    expect(runtime).toContain('const threadId = threadRoute.threadId');
    expect(runtime).toContain("const requestedCharacter = params.get('character')?.toLowerCase() ?? null");
    expect(runtime).toContain('const presentationCharacterKey = !hasThreadRoute && requestedCharacter');
    expect(runtime).toContain("presentationCharacterKey ?? (hasThreadRoute ? null : 'baekheon')");
    expect(runtime).toContain("'thread_identity_pending'");
    expect(runtime).toContain("'thread_identity_invalid'");
    expect(runtime).toContain("root.dataset.characterAuthority = 'presentation_hint_only'");
    expect(runtime).toContain("name: '대화 상대'");
    expect(runtime).not.toContain("(params.get('character') || 'baekheon')");
  });

  it('fails closed on malformed thread route identity instead of falling back to a presentation Character', async () => {
    const runtime = await readFile(roomRuntimePath, 'utf8');

    expect(runtime).toContain('parseChatThreadRouteV1(params)');
    expect(runtime).toContain("threadRoute.state !== 'none'");
    expect(runtime).toContain("'thread_identity_invalid'");
    expect(runtime).toContain('hasThreadRoute ? null');
    expect(runtime).not.toContain("(params.get('character') || 'baekheon')");
  });

  it('keeps My as the fifth active destination instead of falling back to Records', async () => {
    const html = await readFile(hubHtmlPath, 'utf8');

    expect(html).toContain('class="product-nav-link" href="my.html">마이</a>');
    expect(html).toContain('class="product-profile" href="my.html" aria-label="내 프로필"');
    expect(html).toContain('<span>마이</span>');
    expect(html).toContain('class="mobile-nav-link" href="my.html"');
    expect(html).not.toContain('href="#" aria-disabled="true">마이</a>');
    expect(html).not.toContain('class="product-profile" href="records.html" aria-label="내 기록"');
  });

  it('keeps the shared product shell and adds a responsive relationship-first presentation layer', async () => {
    const [html, css, v2Css] = await Promise.all([
      readFile(hubHtmlPath, 'utf8'),
      readFile(hubCssPath, 'utf8'),
      readFile(hubV2CssPath, 'utf8'),
    ]);

    expect(html).toContain('href="product.css"');
    expect(html).toContain('href="chat-hub.css"');
    expect(html).toContain('href="conversation-v2.css"');
    expect(html).toContain('class="product-nav"');
    expect(html).toContain('class="mobile-bottom-nav"');
    expect(css).toContain('.chat-hub-primary');
    expect(css).toContain('.chat-people-grid');
    expect(v2Css).toContain('.conversation-primary');
    expect(v2Css).toContain('.conversation-thread-panel');
    expect(v2Css).toContain('.conversation-incoming');
    expect(v2Css).toContain('@media (max-width: 640px)');
  });
});
