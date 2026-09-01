import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const hubHtmlPath = new URL('../apps/web/chat-hub.html', import.meta.url);
const hubCssPath = new URL('../apps/web/chat-hub.css', import.meta.url);
const hubJsPath = new URL('../apps/web/chat-hub.js', import.meta.url);
const roomHtmlPath = new URL('../apps/web/chat.html', import.meta.url);
const homeHtmlPath = new URL('../apps/web/hall.html', import.meta.url);
const readingHtmlPath = new URL('../apps/web/reading.html', import.meta.url);
const recordsHtmlPath = new URL('../apps/web/records.html', import.meta.url);

describe('MyeongHa conversation hub v1', () => {
  it('keeps the relationship-first hub IA while leaving discovery as a separate lower layer', async () => {
    const html = await readFile(hubHtmlPath, 'utf8');

    const continuation = html.indexOf('이어갈 대화');
    const recent = html.indexOf('최근 대화');
    const incoming = html.indexOf('나에게 온 이야기');
    const discovery = html.indexOf('다른 사람 만나기');

    expect(continuation).toBeGreaterThan(-1);
    expect(recent).toBeGreaterThan(continuation);
    expect(incoming).toBeGreaterThan(recent);
    expect(discovery).toBeGreaterThan(incoming);
    expect(html).toContain('data-incoming-section hidden');
  });

  it('fails closed instead of fabricating a current relationship, recent thread, or incoming character message', async () => {
    const [html, js] = await Promise.all([
      readFile(hubHtmlPath, 'utf8'),
      readFile(hubJsPath, 'utf8'),
    ]);

    expect(html).toContain('아직 이어서 보여줄 대화가 없습니다.');
    expect(html).toContain('아직 남아 있는 최근 대화가 없습니다.');
    expect(html).not.toContain('지난번 당신');
    expect(html).not.toContain('기억하고 있습니다');
    expect(html).not.toContain('퇴사를 고민');
    expect(js).not.toContain('처음 이야기하기');
    expect(js).toContain("actionLabel.textContent = '이야기하기'");
    expect(js).toContain('setContinuation(null)');
    expect(js).toContain('setRecent([])');
    expect(js).toContain('setIncoming([])');
  });

  it('keeps discovery searchable and pageable without freezing a concrete roster as an architectural invariant', async () => {
    const js = await readFile(hubJsPath, 'utf8');

    expect(js).toContain('const PAGE_SIZE = 6');
    expect(js).toContain('data-people-search');
    expect(js).toContain('visibleCount + PAGE_SIZE');
    expect(js).toContain('safePresentationKey');
    expect(js).toContain('encodeURIComponent(safeKey)');
    expect(js).not.toContain('characterId:');
  });

  it('keeps character rooms as focused destinations and routes global conversation entries through the hub', async () => {
    const [room, home, reading, records] = await Promise.all([
      readFile(roomHtmlPath, 'utf8'),
      readFile(homeHtmlPath, 'utf8'),
      readFile(readingHtmlPath, 'utf8'),
      readFile(recordsHtmlPath, 'utf8'),
    ]);

    expect(room).toContain('class="character-room"');
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

  it('uses the shared MyeongHa product shell while giving the hub its own relationship and discovery surfaces', async () => {
    const [html, css] = await Promise.all([
      readFile(hubHtmlPath, 'utf8'),
      readFile(hubCssPath, 'utf8'),
    ]);

    expect(html).toContain('href="product.css"');
    expect(html).toContain('href="chat-hub.css"');
    expect(html).toContain('class="product-nav"');
    expect(html).toContain('class="mobile-bottom-nav"');
    expect(css).toContain('.chat-hub-primary');
    expect(css).toContain('.chat-continuation-card');
    expect(css).toContain('.chat-people-grid');
    expect(css).toContain('@media (max-width: 767px)');
  });
});
