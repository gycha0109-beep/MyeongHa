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
  it('pins the approved Home hierarchy and four-card Saju row', async () => {
    const home = await readWebFile('hall.html');

    expect(home).toContain('class="product-page gm-page"');
    expect(home).toContain('href="golden-master.css"');
    expect(home).toContain('id="home-greeting-name"');
    expect(home).toContain('id="home-current-date"');

    expectInOrder(home, [
      '좋은 저녁이에요',
      '오늘 이야기할 사람',
      '이번 달 사주 읽기',
      '사주 읽기 주제',
      '최근 이야기',
    ]);

    const productSection = home.match(/<div class="gm-home-products">([\s\S]*?)<\/div>\s*<\/section>/u)?.[1] ?? '';
    expect(productSection.match(/gm-product-card/gu)).toHaveLength(4);
    expectInOrder(productSection, ['전체 사주', '직업 · 커리어', '재물', '연애 · 관계']);

    expect(home).toContain('href="chat-hub.html">대화로 가기 →</a>');
    expect(home).toContain('지금은 저장된 사실을 이야기로 추측해 이어 붙이지 않습니다.');
    expect(home).not.toContain('연화');
    expect(home).not.toContain('세연');
    expect(home).not.toContain('chat.html?character=');
    expect(home).not.toContain('이직 고민');
    expect(home).not.toContain('3일 전');
    expect(home).not.toContain('home-sidebar');
    expect(home).not.toContain('gm-sidebar');
  });

  it('pins the approved Saju 3 + 3 + full-width catalog structure', async () => {
    const saju = await readWebFile('reading.html');

    expect(saju).toContain('class="product-page gm-page saju-hub-page"');
    expect(saju).toContain('id="saju-hub"');
    expectInOrder(saju, [
      '나의 명식',
      '나를 읽기',
      '전체 사주',
      '직업 · 커리어',
      '재물',
      '연애 · 관계',
      '사업',
      '가족',
      '삶의 단계',
      '지금의 흐름',
      '올해',
      '이번 달',
      '사람과의 관계',
      '배우자 · 관계',
      '궁합',
      '고민이 있다면',
      '지금 고민으로 보기',
    ]);

    const catalog = saju.match(/<div class="gm-saju-reading-grid">([\s\S]*?)<\/div>\s*<\/section>/u)?.[1] ?? '';
    expect(catalog.match(/gm-saju-reading-card/g)).toHaveLength(7);
    expect(catalog.match(/gm-saju-reading-card is-wide/g)).toHaveLength(1);

    const runtimeIds = [
      'saju-status',
      'saju-empty',
      'saju-birth-form',
      'saju-birth-year',
      'saju-birth-month',
      'saju-birth-day',
      'saju-birth-time',
      'saju-time-unknown',
      'saju-leap-wrap',
      'saju-leap-month',
      'saju-birth-sex',
      'saju-form-error',
      'saju-create-button',
      'saju-pillar-grid',
      'saju-element-bars',
      'saju-day-master',
      'saju-day-master-meta',
      'saju-completeness-title',
      'saju-completeness-copy',
      'saju-birth-summary',
      'saju-flow-year',
    ] as const;

    for (const id of runtimeIds) expect(saju).toContain(`id="${id}"`);
    expect(saju).not.toContain('gm-sidebar');
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
