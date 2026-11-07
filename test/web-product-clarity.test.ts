import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
const read = (path: string) => readFile(new URL('../apps/web/' + path, import.meta.url), 'utf8');
const routes = ["hall","reading","face-reading","chat-hub","chat","records","my","reading-detail","auth","contact"] as const;
describe('product-wide identity and clarity', () => {
  it.each(routes)('%s uses 命河 and loads the common readability layer', async page => {
    const html = await read(page + '.html');
    expect(html).toContain('class="product-brand-seal" aria-hidden="true">命河</span>');
    expect(html).not.toContain('明河');
    const i = html.indexOf('href="ui-i18n.css"');
    const c = html.indexOf('href="product-clarity.css"');
    const h = html.indexOf('href="shared-product-header.css"');
    expect(i).toBeGreaterThan(-1); expect(c).toBeGreaterThan(i); expect(h).toBeGreaterThan(c);
  });
  it('renders one original PNG icon family across the six bottom menu choices', async () => {
    const css = await read('product-clarity.css');
    for (const href of ["hall.html","reading.html","face-reading.html","chat-hub.html","records.html","my.html"]) expect(css).toContain('mobile-nav-link[href="' + href + '"]');
    expect(css.match(/--mh-nav-icon: url\("assets\/myeongha-icons\//g)).toHaveLength(6);
    for (const name of ['home','saju','facial','talk','report','my','light','dark','notification','language']) {
      const png = await readFile(new URL('../apps/web/assets/myeongha-icons/' + name + '.png', import.meta.url));
      expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(png.readUInt32BE(16)).toBe(1254);
      expect(png.readUInt32BE(20)).toBe(1254);
      expect(png[25]).toBe(6); // Original PNG includes an alpha channel for CSS masks.
    }
    expect(css).toContain('grid-template-columns: repeat(6, minmax(0, 1fr));');
    expect(css).toContain('font-size: 0 !important;');
    expect(css).toContain('mobile-nav-link[href="my.html"] { --mh-nav-icon: url("assets/myeongha-icons/my.png")');
  });
  it('routes Chat customer support to the existing governed inquiry form', async () => {
    const hub = await read('chat-hub.html');
    const contact = await read('contact.html');
    expect(hub).toContain('<a href="contact.html">고객지원</a>');
    expect(hub).not.toContain('<a href="#">고객지원</a>');
    expect(contact).toContain('id="contact-form"');
    expect(contact).toContain('src="/contact.js"');
  });

  it('does not expose unapproved legal notices as misleading footer links', async () => {
    const hub = await read('chat-hub.html');
    const css = await read('product.css');
    for (const label of ['서비스 안내 (준비 중)', '이용약관 (공개 준비 중)', '개인정보처리방침 (공개 준비 중)']) {
      expect(hub).toContain('<span class="product-footer-unavailable">' + label + '</span>');
    }
    expect(hub).not.toContain('href="#"');
    expect(hub).toContain('<a href="contact.html">고객지원</a>');
    expect(css).toContain('.product-footer-unavailable { opacity: .76; cursor: default; }');
  });

  it('applies legible copy rules to Home, Saju, Chat, Records, My and Face', async () => {
    const css = await read('product-clarity.css');
    for (const selector of ['.mhx-topic-copy small','.saju-design-source-note','.chat-recent-time','.records-lead','.my-account-meta','.face-reader-copy p']) expect(css).toContain(selector);
    expect(css).toContain('font-size: max(14px, .875rem);');
    expect(css).toContain('body.product-page.face-reading-page');
  });
});
