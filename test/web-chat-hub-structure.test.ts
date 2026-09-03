import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const hubHtmlPath = new URL('../apps/web/chat-hub.html', import.meta.url);
const hubCssPath = new URL('../apps/web/chat-hub.css', import.meta.url);
const hubV2CssPath = new URL('../apps/web/conversation-v2.css', import.meta.url);
const hubJsPath = new URL('../apps/web/chat-hub.js', import.meta.url);
const roomHtmlPath = new URL('../apps/web/chat.html', import.meta.url);
const homeHtmlPath = new URL('../apps/web/hall.html', import.meta.url);
const readingHtmlPath = new URL('../apps/web/reading.html', import.meta.url);
const recordsHtmlPath = new URL('../apps/web/records.html', import.meta.url);

describe('MyeongHa conversation hub relationship-first IA', () => {
  it('puts ongoing relationships before character discovery', async () => {
    const html = await readFile(hubHtmlPath, 'utf8');

    const primary = html.indexOf('class="chat-hub-primary conversation-primary"');
    const myConversations = html.indexOf('내 대화');
    const incoming = html.indexOf('나에게 온 이야기');
    const discoverySection = html.indexOf('id="people"');

    expect(primary).toBeGreaterThan(-1);
    expect(myConversations).toBeGreaterThan(primary);
    expect(incoming).toBeGreaterThan(myConversations);
    expect(discoverySection).toBeGreaterThan(incoming);
    expect(html).toContain('누구와 이야기를 이어갈까요?');
    expect(html).toContain('지금 이어갈 사람');
    expect(html).toContain('data-incoming-section hidden');
    expect(html).not.toContain('<h2 id="recent-title">최근 대화</h2>');
  });

  it('fails closed instead of fabricating a relationship, recent thread, or incoming story', async () => {
    const [html, js] = await Promise.all([
      readFile(hubHtmlPath, 'utf8'),
      readFile(hubJsPath, 'utf8'),
    ]);

    expect(html).toContain('아직 이어지고 있는 대화가 없습니다.');
    expect(html).toContain('아직 이어지고 있는 관계가 없습니다.');
    expect(html).not.toContain('퇴사를 고민했던 이야기');
    expect(html).not.toContain('지난번 당신');
    expect(js).toContain('setContinuation(null)');
    expect(js).toContain('setRecent([])');
    expect(js).toContain('setIncoming([])');
    expect(js).toContain('typeof state.threadTitle');
    expect(js).toContain('item.hasIncoming === true');
    expect(js).not.toContain('threadTitle:');
    expect(js).not.toContain('hasIncoming: true');
  });

  it('keeps discovery searchable and pageable without inventing canonical character authority', async () => {
    const js = await readFile(hubJsPath, 'utf8');

    expect(js).toContain('const PAGE_SIZE = 6');
    expect(js).toContain('data-people-search');
    expect(js).toContain('visibleCount + PAGE_SIZE');
    expect(js).toContain('safePresentationKey');
    expect(js).toContain("url.searchParams.set('character', safeKey)");
    expect(js).not.toContain('characterId:');
  });

  it('uses the approved Se-yeon image only for Se-yeon presentation hooks', async () => {
    const css = await readFile(hubV2CssPath, 'utf8');

    expect(css).toContain('.chat-person-art[data-character="seyeon"]');
    expect(css).toContain('.chat-incoming-art[data-character="seyeon"]');
    expect(css).toContain('.chat-recent-avatar[data-character="seyeon"]');
    expect(css).toContain('url("seyeon-chat.webp")');

    for (const key of ['baekheon', 'yeoul', 'seorin', 'rahyeon', 'mira', 'taegyeom', 'yunho', 'doyoon']) {
      expect(css).not.toContain(`[data-character="${key}"] {\n  background-image: url("seyeon-chat.webp")`);
    }
  });

  it('keeps character rooms as focused destinations and routes global conversation entries through the hub', async () => {
    const [room, home, reading, records] = await Promise.all([
      readFile(roomHtmlPath, 'utf8'),
      readFile(homeHtmlPath, 'utf8'),
      readFile(readingHtmlPath, 'utf8'),
      readFile(recordsHtmlPath, 'utf8'),
    ]);

    expect(room).toContain('class="product-page character-room character-room-v2"');
    expect(room).toContain('href="chat-hub.html" aria-label="대화 허브로 돌아가기"');
    expect(home).toContain('href="chat-hub.html">대화</a>');
    expect(home).toContain('href="chat-hub.html">대화로 가기 →</a>');
    expect(reading).toContain('href="chat-hub.html">대화</a>');
    expect(records).toContain('href="chat-hub.html">대화</a>');
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
