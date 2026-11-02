import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SAJU_RADAR_ELEMENT_ORDER_V1,
  SAJU_RADAR_ELEMENT_COLORS_V1,
  buildSajuRadarGeometryV1,
  sajuRadarElementLabelV1,
} from '../apps/web/saju-five-elements-radar.js';
import { translateStaticUi } from '../apps/web/ui-i18n.js';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Saju radar stays independent of the four-pillars tab', () => {
  it('renders only the two established tabs, with no calculation-status tab', () => {
    const page = read('apps/web/src/reading/ReadingPage.tsx');
    expect(page).toContain("useState<'pillars' | 'elements'>('pillars')");
    expect(page).toContain('id="saju-pillars-tab"');
    expect(page).toContain('id="saju-elements-tab"');
    expect(page).toContain('id="saju-pillars-panel"');
    expect(page).toContain('id="saju-elements-panel"');
    expect(page).toContain('id="saju-element-radar"');
    expect(page).toContain('id="saju-pillar-grid"');
    expect(page).toContain('id="saju-element-bars"');
    expect(page).toContain('id="saju-completeness-title"');
    expect(page).not.toContain("setChartTab('structure')");
    expect(page).not.toContain('saju-design-structure-panel');
    expect(page).not.toContain('id="saju-structure-tab"');
    expect(page).toContain('setChartTab(\'pillars\')');
    expect(page).toContain('disabled={!selectedElement}');
  });

  it('plots actual 8-character element counts rather than invented strength scores', () => {
    const geometry = buildSajuRadarGeometryV1({ 목: 2, 화: 2, 토: 2, 금: 1, 수: 1 });
    expect(SAJU_RADAR_ELEMENT_ORDER_V1).toEqual(['목', '화', '토', '금', '수']);
    expect(geometry.max).toBe(2);
    expect(geometry.axes.map(({ value }) => value)).toEqual([2, 2, 2, 1, 1]);
    expect(geometry.rings).toHaveLength(4);
    const center = geometry.center;
    const distance = (p: { x: number; y: number }) =>
      Math.hypot(p.x - center.x, p.y - center.y);
    expect(distance(geometry.axes[0]!.point)).toBeCloseTo(82);
    expect(distance(geometry.axes[3]!.point)).toBeCloseTo(41);
    expect(SAJU_RADAR_ELEMENT_COLORS_V1['목']).toMatch(/^#[0-9a-f]{6}$/i);
    const zero = buildSajuRadarGeometryV1({ 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 });
    expect(zero.max).toBe(1);
    for (const axis of zero.axes) expect(axis.point).toEqual(zero.center);
  });

  it('provides localized labels and chart explanation for four non-Korean languages', () => {
    expect(sajuRadarElementLabelV1('목', 'en-US')).toBe('Wood');
    expect(sajuRadarElementLabelV1('목', 'ja-JP')).toBe('木');
    for (const locale of ['en-US', 'zh-CN', 'ja-JP', 'zh-TW'] as const) {
      for (const source of ['명식에서 보기', '계산 확인 중',
        '오행을 선택하면 관련 천간·지지를 명식에서 강조합니다.',
        '서버가 계산한 천간·지지 8글자의 오행 개수입니다. 강약 점수가 아닙니다.']) {
        const text = translateStaticUi(source, locale);
        expect(text, `${locale}: ${source}`).not.toBe(source);
        expect(text, `${locale}: ${source}`).not.toMatch(/[가-힣]/u);
      }
    }
  });

  it('highlights only the exact matching stem/branch characters and keeps the choice between tabs', () => {
    const runtime = read('apps/web/saju-hub.js');
    const radar = read('apps/web/saju-five-elements-radar.js');
    expect(runtime).toContain("for (const partKey of ['stem', 'branch'])");
    expect(runtime).toContain("character.dataset.sajuPartElement =");
    expect(runtime).toContain("part.dataset.sajuPartElement === selected");
    expect(runtime).toContain("card.classList.toggle('is-element-linked'");
    expect(runtime).toContain("selectedSajuElement = selectedSajuElement === element ? null : element");
    expect(runtime).toContain("'myeongha:saju-element-selected'");
    expect(runtime).toContain('lastRenderedSajuSnapshot');
    expect(radar).toContain("document.createElementNS(SVG_NS, tag)");
    expect(radar).toContain("group.addEventListener('keydown'");
    expect(radar).toContain("button.setAttribute('aria-pressed'");
    expect(runtime).not.toContain('Math.random');
  });
});
