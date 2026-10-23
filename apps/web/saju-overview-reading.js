import { getActiveBearer } from './product-auth.js';
import { getUiLocale } from './ui-i18n.js';
import { isBrowserSajuPreviewDeliveryV1 } from './saju-preview-response-admission.js';

const ENDPOINT = '/api/me/saju/preview-reading';
let generation = 0;

function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error('Missing Saju overview preview element: ' + id);
  return element;
}

function visibleBlockLines(block) {
  if (!block || typeof block !== 'object') return [];
  if (block.type === 'paragraph' && typeof block.text === 'string') {
    return [block.text];
  }
  if (block.type === 'key_points' && Array.isArray(block.items)) {
    return block.items;
  }
  if (block.type === 'comparison' && Array.isArray(block.perspectives)) {
    return block.perspectives.map((item) => item.label + ': ' + item.text);
  }
  if (block.type === 'ambiguity') {
    return [
      block.summary,
      ...(Array.isArray(block.scenarios)
        ? block.scenarios.map((item) => item.label + ': ' + item.text) : []),
    ];
  }
  if (block.type === 'timeline' && Array.isArray(block.entries)) {
    return block.entries.map((item) => item.label + ': ' + item.text);
  }
  if (block.type === 'fact_table' && Array.isArray(block.rows)) {
    return block.rows.map((item) => item.label + ': ' + item.value);
  }
  // Source hints are evidence metadata, not user-facing interpretation prose.
  return [];
}

function validSections(payload) {
  if (!isBrowserSajuPreviewDeliveryV1(payload)) return [];
  return payload.data.reading.reading.sections
    .filter((section) => section.state !== 'unavailable' && section.title !== '프리뷰 안내')
    .map((section) => ({
      title: section.title,
      lines: section.blocks.flatMap(visibleBlockLines)
        .filter((line) => typeof line === 'string'
          && line.trim().length > 0 && !line.startsWith('근거 구조:')),
    }))
    .filter((section) => section.lines.length > 0);
}

function state(message, kind) {
  const status = byId('saju-overview-status');
  status.textContent = message;
  status.dataset.state = kind;
  status.hidden = false;
}

function renderSections(sections) {
  const content = byId('saju-overview-result');
  content.replaceChildren();
  for (const section of sections) {
    const article = document.createElement('article');
    article.className = 'saju-overview-section';
    const title = document.createElement('h3');
    title.textContent = section.title;
    article.append(title);
    for (const line of section.lines) {
      const paragraph = document.createElement('p');
      paragraph.textContent = line;
      article.append(paragraph);
    }
    content.append(article);
  }
  byId('saju-overview-status').hidden = true;
  byId('saju-overview-full').hidden = false;
}

export async function loadSajuOverviewReadingV1(activeBearer) {
  const current = ++generation;
  const panel = byId('saju-overview-preview');
  const retry = byId('saju-overview-retry');
  panel.hidden = false;
  retry.hidden = true;
  byId('saju-overview-full').hidden = true;
  byId('saju-overview-result').replaceChildren();
  state('실제 사주 해석을 불러오는 중입니다…', 'loading');

  try {
    if (!activeBearer?.token) throw new Error('Authentication is unavailable.');
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Language': getUiLocale(),
        Authorization: 'Bearer ' + activeBearer.token,
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ readingText: '전체 사주' }),
    });
    const payload = await response.json();
    const nowBearer = await getActiveBearer();
    if (current !== generation || nowBearer?.kind !== activeBearer.kind
        || nowBearer?.token !== activeBearer.token) return;

    if (!response.ok) throw new Error('Reading source is unavailable.');
    const sections = validSections(payload);
    if (sections.length === 0) throw new Error('No source-admitted Reading sections.');
    renderSections(sections);
  } catch {
    if (current !== generation) return;
    state('현재 전체 사주 해석을 불러올 수 없습니다. 출생정보를 다시 입력할 필요는 없습니다.', 'unavailable');
    retry.hidden = false;
  }
}

export function installSajuOverviewRetryV1() {
  byId('saju-overview-retry').addEventListener('click', async () => {
    const bearer = await getActiveBearer().catch(() => null);
    if (bearer) await loadSajuOverviewReadingV1(bearer);
    else state('세션을 확인할 수 없습니다. 다시 로그인한 뒤 시도해 주세요.', 'unavailable');
  });
}
