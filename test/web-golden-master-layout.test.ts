import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(process.cwd(), 'apps/web');

async function readWebFile(name: string) {
  return readFile(resolve(webRoot, name), 'utf8');
}

function expectInOrder(source: string, labels: readonly string[]) {
  let cursor = -1;
  for (const label of labels) {
    const next = source.indexOf(label, cursor + 1);
    expect(next, `Expected ${JSON.stringify(label)} after source offset ${cursor}`).toBeGreaterThan(cursor);
    cursor = next;
  }
}

describe('Web Golden Master', () => {
  it('pins the topic-first Home hierarchy, approved preview links, and real asset discovery', async () => {
    const [html, page, css] = await Promise.all([
      readWebFile('hall.html'),
      readWebFile('src/home/HomePage.tsx'),
      readWebFile('home-moonlight.css'),
    ]);
    const home = `${html}\n${page}`;

    expect(home).toContain('class="product-page gm-page"');
    expect(home).toContain('href="golden-master.css"');
    expect(home).toContain('href="home-moonlight.css"');
    expect(home).toContain('id="mhx-hero-title"');
    expectInOrder(page.slice(page.indexOf('return (')), [
      'mhx-hero', 'mhx-topics', 'mhx-characters', 'mhx-content-grid', 'mhx-recent',
    ]);

    const topicCatalog = page.match(/const readingTopics = \[([\s\S]*?)\] as const;/u)?.[1] ?? '';
    expect(topicCatalog.match(/motif:/gu)).toHaveLength(4);
    expectInOrder(topicCatalog, ['전체 사주', '직업 · 커리어', '재물', '연애 · 관계']);
    for (const href of [
      'reading-detail.html?topic=temperament&scope=original',
      'reading-detail.html?topic=career',
      'reading-detail.html?topic=money',
      'reading-detail.html?topic=love',
    ]) expect(topicCatalog).toContain(href);

    expect(home).toContain('href="chat-hub.html"');
    expect(page).toContain("findReaderPresentation(key)");
    expect(page).toContain('reader.portrait');
    expect(page).toContain('최근 대화 기록은 아직 홈에 연결되지 않았습니다.');
    expect(page).not.toContain('chat.html?character=');
    expect(page).not.toContain('퇴사를 고민했던 이야기');
    expect(page).not.toContain('3일 전');
    expect(page).not.toContain('인연 120');
    expect(css).toMatch(/\.mhx-topics\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,/u);
    expect(css).toContain('@media (max-width: 580px)');
    expect(home).not.toContain('home-sidebar');
    expect(home).not.toContain('gm-sidebar');
  });

  it('pins the Saju free-preview reference layout and retained calculation identifiers', async () => {
    const [html, page, design] = await Promise.all([
      readWebFile('reading.html'),
      readWebFile('src/reading/ReadingPage.tsx'),
      readWebFile('saju-preview-landing.css'),
    ]);
    const saju = `${html}\n${page}`;

    expect(saju).toContain('class="product-page gm-page saju-hub-page"');
    expect(html).toContain('href="saju-preview-landing.css"');
    expect(saju).toContain('id="saju-hub"');
    expectInOrder(page.slice(page.indexOf('return (')), [
      'saju-empty',
      'saju-hub',
      '나의 사주 기본 정보',
      '입력 정보',
      '나의 사주 명식',
      '사주 해석 상품',
      '보고서 구성 미리보기',
    ]);
    expectInOrder(page.slice(page.indexOf('const sajuProductTopics')), [
      '전체 사주 해석', '직업 · 커리어', '재물', '연애 · 관계',
      '사업', '가족', '삶의 단계', '올해', '이번 달', '배우자', '궁합', '지금 고민으로 보기',
    ]);

    const runtimeIds = [
      'saju-status', 'saju-empty', 'saju-birth-form',
      'saju-birth-year', 'saju-birth-month', 'saju-birth-day',
      'saju-birth-time', 'saju-time-unknown', 'saju-leap-wrap',
      'saju-leap-month', 'saju-birth-sex', 'saju-form-error',
      'saju-create-button', 'saju-pillar-grid', 'saju-element-bars',
      'saju-day-master', 'saju-day-master-meta', 'saju-completeness-title',
      'saju-completeness-copy', 'saju-birth-summary', 'saju-flow-year',
      'saju-birth-date-display', 'saju-birth-time-display',
      'saju-birth-sex-display', 'saju-birth-place-display',
      'saju-birth-calendar-display',
    ] as const;
    for (const id of runtimeIds) expect(saju).toContain(`id="${id}"`);
    expect(saju).not.toContain('gm-sidebar');
    expect(design).toContain('.saju-design-product-grid');
    expect(design).toContain('@media (max-width:690px)');
  });

  it('pins the desktop geometry and post-theme lock layer', async () => {
    const [golden, lock, theme] = await Promise.all([
      readWebFile('golden-master.css'),
      readWebFile('golden-master-lock.css'),
      readWebFile('product-theme.js'),
    ]);

    expect(golden).toContain('--gm-max: 1240px');
    expect(golden).toMatch(/\.gm-home-products\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,/u);
    expect(golden).toMatch(/\.gm-saju-reading-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,/u);
    expect(golden).toContain('.gm-saju-reading-card.is-wide { grid-column: 1 / -1; }');
    expect(lock).toContain('home-v5-orbit.webp');
    expect(lock).toMatch(/body\.gm-page \.gm-saju-hero\s*\{[\s\S]*?overflow:\s*visible/u);
    expect(theme).toContain('data-golden-master-lock');
    expect(theme).toContain("lock.href = 'golden-master-lock.css'");
  });
});
