import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const web = (name: string) => new URL(`../apps/web/${name}`, import.meta.url);

describe('Records v2 product surface', () => {
  it('uses the shared product shell without the legacy night shell', async () => {
    const html = await readFile(web('records.html'), 'utf8');
    expect(html).toContain('href="product.css"');
    expect(html).toContain('href="records-v2.css"');
    expect(html).not.toContain('href="styles.css"');
    expect(html).not.toContain('data-theme="night"');
    expect(html).not.toContain('src="app.js"');
    expect(html).toContain('class="product-nav"');
    expect(html).toContain('class="mobile-bottom-nav"');
  });

  it('preserves report-only read runtime mount points without redundant tabs', async () => {
    const [html, component, js] = await Promise.all([
      readFile(web('records.html'), 'utf8'),
      readFile(web('src/records/RecordsPage.tsx'), 'utf8'),
      readFile(web('records-page.js'), 'utf8'),
    ]);
    const markup = `${html}\n${component}`;
    for (const id of ['records-status', 'records-content', 'saju-records-list']) {
      expect(markup).toContain(`id="${id}"`);
    }
    expect(js).toContain('createRecordsRuntimeClient().readRecords()');
    expect(js).not.toContain('renderCurrentBirthProfile');
    expect(js).not.toContain('renderMemories');
    expect(markup).not.toContain('life-records-list');
    expect(markup).not.toContain('records-profile-strip');
    expect(js).not.toContain('renderProfile(');
    expect(markup).not.toContain('role="tablist"');
    expect(js).not.toContain('function setupTabs()');
  });

  it('keeps all five global destinations coherent', async () => {
    const html = await readFile(web('records.html'), 'utf8');
    for (const href of ['hall.html', 'reading.html', 'chat-hub.html', 'records.html', 'my.html']) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain('href="records.html" aria-current="page"');
  });
});

describe('mobile web width integration', () => {
  it('keeps viewport metadata on every primary surface', async () => {
    for (const file of ['hall.html', 'reading.html', 'chat-hub.html', 'chat.html', 'records.html', 'my.html']) {
      const html = await readFile(web(file), 'utf8');
      expect(html).toContain('name="viewport"');
      expect(html).toContain('width=device-width');
    }
  });

  it('has explicit phone/tablet layout contracts across all primary surfaces', async () => {
    const [product, reading, hub, room, records, my] = await Promise.all([
      readFile(web('product.css'), 'utf8'),
      readFile(web('reading-v3.css'), 'utf8'),
      readFile(web('chat-hub.css'), 'utf8'),
      readFile(web('chat-room.css'), 'utf8'),
      readFile(web('records-v2.css'), 'utf8'),
      readFile(web('my.css'), 'utf8'),
    ]);
    expect(product).toContain('@media (max-width: 767px)');
    expect(product).toContain('@media (max-width: 420px)');
    expect(reading).toContain('@media (max-width: 900px)');
    expect(reading).toContain('@media (max-width: 767px)');
    expect(hub).toContain('@media (max-width: 860px)');
    expect(hub).toContain('@media (max-width: 767px)');
    expect(room).toContain('@media (max-width: 767px)');
    expect(records).toContain('@media(max-width:767px)');
    expect(records).toContain('@media(max-width:420px)');
    expect(my).toContain('@media (max-width: 767px)');
    expect(my).toContain('@media (max-width: 520px)');
  });

  it('does not route generic My conversation navigation into one Character Room', async () => {
    const html = await readFile(web('my.html'), 'utf8');
    expect(html).toContain('href="chat-hub.html">대화</a>');
    expect(html).not.toContain('href="chat.html">대화</a>');
  });

  it('turns Records report cards into a phone-safe single column', async () => {
    const css = await readFile(web('records-v2.css'), 'utf8');
    expect(css).toContain('.records-reading-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))');
    expect(css).toContain('.records-reading-grid{grid-template-columns:1fr}');
  });
});
