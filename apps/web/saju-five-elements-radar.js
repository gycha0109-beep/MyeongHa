// Presentation-only five-element radar for server-calculated Saju facts.
// Each axis shows an observed character count, not strength, luck or a score.
export const SAJU_RADAR_ELEMENT_ORDER_V1 = Object.freeze(['목', '화', '토', '금', '수']);
export const SAJU_RADAR_ELEMENT_COLORS_V1 = Object.freeze({
  목: '#98b68f',
  화: '#d99686',
  토: '#d5b27c',
  금: '#c2c5cb',
  수: '#92b4d0',
});
const ELEMENT_LABELS = Object.freeze({
  'en-US': Object.freeze({ 목: 'Wood', 화: 'Fire', 토: 'Earth', 금: 'Metal', 수: 'Water' }),
  'ko-KR': Object.freeze({ 목: '목', 화: '화', 토: '토', 금: '금', 수: '수' }),
  'ja-JP': Object.freeze({ 목: '木', 화: '火', 토: '土', 금: '金', 수: '水' }),
  'zh-TW': Object.freeze({ 목: '木', 화: '火', 토: '土', 금: '金', 수: '水' }),
  'zh-CN': Object.freeze({ 목: '木', 화: '火', 토: '土', 금: '金', 수: '水' }),
});

const SVG_NS = 'http://www.w3.org/2000/svg';

export function sajuRadarElementLabelV1(element, locale = 'ko-KR') {
  const labels = ELEMENT_LABELS[locale] ?? ELEMENT_LABELS['ko-KR'];
  return labels[element] ?? element;
}

export function buildSajuRadarGeometryV1(counts, options = {}) {
  const cx = options.cx ?? 160;
  const cy = options.cy ?? 133;
  const radius = options.radius ?? 82;
  const max = Math.max(1, ...SAJU_RADAR_ELEMENT_ORDER_V1.map((element) =>
    Number.isFinite(counts[element]) ? Math.max(0, counts[element]) : 0));
  const at = (index, ratio) => {
    const angle = (-Math.PI / 2) + (Math.PI * 2 * index / 5);
    return Object.freeze({
      x: Number((cx + Math.cos(angle) * radius * ratio).toFixed(2)),
      y: Number((cy + Math.sin(angle) * radius * ratio).toFixed(2)),
    });
  };
  return Object.freeze({
    center: Object.freeze({ x: cx, y: cy }),
    max,
    rings: Object.freeze([0.25, 0.5, 0.75, 1].map((scale) =>
      Object.freeze(SAJU_RADAR_ELEMENT_ORDER_V1.map((_, i) => at(i, scale))))),
    axes: Object.freeze(SAJU_RADAR_ELEMENT_ORDER_V1.map((element, index) => {
      const value = Number.isFinite(counts[element]) ? Math.max(0, counts[element]) : 0;
      return Object.freeze({
        element,
        value,
        point: at(index, value / max),
        end: at(index, 1),
        label: at(index, 1.38),
      });
    })),
  });
}

function svgNode(document, tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

const points = (items) => items.map((point) =>
  `${point.x},${point.y}`).join(' ');

export function mountSajuRadarV1({
  document, chartRoot, choicesRoot, counts, locale = 'ko-KR',
  selectedElement = null, onSelect = () => {},
}) {
  const geometry = buildSajuRadarGeometryV1(counts);
  const svg = svgNode(document, 'svg', {
    viewBox: '0 0 320 275',
    class: 'saju-radar-svg',
    role: 'group',
    'aria-label': locale === 'en-US'
      ? 'Five-element counts from eight Saju characters'
      : locale === 'ja-JP' ? '四柱八字の五行分布'
      : locale === 'zh-TW' ? '八字五行分布'
      : locale === 'zh-CN' ? '八字五行分布'
      : '사주팔자 여덟 글자의 오행 분포',
  });
  for (const ring of geometry.rings) {
    svg.append(svgNode(document, 'polygon', {
      points: points(ring), class: 'saju-radar-grid-ring',
    }));
  }
  for (const axis of geometry.axes) {
    svg.append(svgNode(document, 'line', {
      x1: geometry.center.x, y1: geometry.center.y,
      x2: axis.end.x, y2: axis.end.y,
      class: 'saju-radar-axis-line',
    }));
  }
  svg.append(svgNode(document, 'polygon', {
    points: points(geometry.axes.map((axis) => axis.point)),
    class: 'saju-radar-value-shape',
  }));
  const buttons = [];
  for (const axis of geometry.axes) {
    const color = SAJU_RADAR_ELEMENT_COLORS_V1[axis.element];
    svg.append(svgNode(document, 'circle', {
      cx: axis.point.x, cy: axis.point.y, r: 4.2,
      fill: color, class: 'saju-radar-value-node',
      'data-saju-element': axis.element,
    }));
    const label = sajuRadarElementLabelV1(axis.element, locale);
    const group = svgNode(document, 'g', {
      class: 'saju-radar-axis-choice',
      role: 'button',
      tabindex: '0',
      'aria-label': `${label} ${axis.value}`,
      'aria-pressed': selectedElement === axis.element ? 'true' : 'false',
      'data-saju-element-select': axis.element,
    });
    const badge = svgNode(document, 'rect', {
      x: axis.label.x - 27, y: axis.label.y - 14,
      width: 54, height: 28, rx: 14,
      class: 'saju-radar-axis-badge',
    });
    const text = svgNode(document, 'text', {
      x: axis.label.x, y: axis.label.y + 4,
      'text-anchor': 'middle', class: 'saju-radar-axis-label',
    });
    text.textContent = `${label} ${axis.value}`;
    group.style.setProperty('--saju-element-color', color);
    group.append(badge, text);
    group.addEventListener('click', () => onSelect(axis.element));
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect(axis.element);
      }
    });
    svg.append(group);
  }
  for (const element of SAJU_RADAR_ELEMENT_ORDER_V1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'saju-element-choice';
    button.dataset.sajuElementSelect = element;
    button.style.setProperty('--saju-element-color', SAJU_RADAR_ELEMENT_COLORS_V1[element]);
    button.setAttribute('aria-pressed', element === selectedElement ? 'true' : 'false');
    const title = document.createElement('b');
    title.textContent = sajuRadarElementLabelV1(element, locale);
    const count = document.createElement('span');
    count.textContent = String(Math.max(0, Number(counts[element]) || 0));
    button.append(title, count);
    button.addEventListener('click', () => onSelect(element));
    buttons.push(button);
  }
  chartRoot.replaceChildren(svg);
  choicesRoot.replaceChildren(...buttons);
  return geometry;
}
