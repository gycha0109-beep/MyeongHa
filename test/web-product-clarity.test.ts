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
  it('renders one matched vector family across the six bottom menu choices', async () => {
    const css = await read('product-clarity.css');
    for (const href of ["hall.html","reading.html","face-reading.html","chat-hub.html","records.html","my.html"]) expect(css).toContain('mobile-nav-link[href="' + href + '"]');
    expect(css.match(/--mh-nav-icon: url\("assets\/myeongha-icons\//g)).toHaveLength(6);
    for (const name of ['home','saju','face','chat','records','my','theme-sun','theme-moon','notification','language']) {
      const svg = await read('assets/myeongha-icons/' + name + '.svg');
      expect(svg).toContain('viewBox="0 0 48 48"');
      expect(svg).toContain('fill="none"');
      expect(svg).toContain('stroke="#000"');
      expect(svg).toContain('stroke-width="2.5"');
      expect(svg).toContain('stroke-linecap="round"');
      expect(svg).toContain('stroke-linejoin="round"');
      expect(svg).toMatch(/<path d="[^"]*[CcQqAa][^"]*"\/>/);
      expect(svg).not.toContain('fill-rule="evenodd"');
    }
    expect(css).toContain('grid-template-columns: repeat(6, minmax(0, 1fr));');
    expect(css).toContain('font-size: 0 !important;');
    expect(css).toContain('mobile-nav-link[href="my.html"] { --mh-nav-icon: url("assets/myeongha-icons/my.svg")');
  });
  it('applies legible copy rules to Home, Saju, Chat, Records, My and Face', async () => {
    const css = await read('product-clarity.css');
    for (const selector of ['.mhx-topic-copy small','.saju-design-source-note','.chat-recent-time','.records-lead','.my-account-meta','.face-reader-copy p']) expect(css).toContain(selector);
    expect(css).toContain('font-size: max(13px, .8125rem);');
    expect(css).toContain('body.product-page.face-reading-page');
  });
});
