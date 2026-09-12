import { resolveReadingDetailRoute } from './reading-detail-route.js';

const readerCatalog = {
  baekheon: {
    name: '백헌',
    hanja: '白憲',
    title: '충추원의 장',
    intro: '당신의 사주를 바탕으로 지금의 흐름부터 하나씩 살펴보겠습니다.',
  },
  seyeon: {
    name: '세연',
    hanja: '',
    title: '',
    intro: '복잡하게 시작하지 않을게요. 지금 가장 크게 읽히는 흐름부터 같이 봐요.',
  },
  yeoul: {
    name: '여울',
    hanja: '',
    title: '',
    intro: '돌려 말하지 않을게요. 지금 필요한 흐름부터 바로 짚겠습니다.',
  },
  seorin: {
    name: '서린',
    hanja: '',
    title: '',
    intro: '지금의 흐름이 예전의 어떤 기록과 이어지는지 천천히 살펴볼게요.',
  },
  rahyeon: {
    name: '라현',
    hanja: '',
    title: '',
    intro: '표면적인 답보다, 당신이 실제로 흔들리는 지점부터 읽어보죠.',
  },
  mira: {
    name: '미라',
    hanja: '',
    title: '',
    intro: '과하게 의미 붙이지 말고, 지금 쓸 수 있는 정보부터 보죠.',
  },
  taegyeom: {
    name: '태겸',
    hanja: '',
    title: '',
    intro: '근거 없는 낙관은 빼겠습니다. 확인되는 구조부터 보죠.',
  },
  yunho: {
    name: '윤호',
    hanja: '',
    title: '',
    intro: '급하게 결론부터 내리지 않고, 구조와 시기를 차례대로 읽어보겠습니다.',
  },
  doyoon: {
    name: '도윤',
    hanja: '',
    title: '',
    intro: '일단 재미없는 설명부터 길게 하진 않을게요. 지금 걸리는 부분부터 보죠.',
  },
};

const aliases = new Map([
  ['백헌', 'baekheon'], ['세연', 'seyeon'], ['여울', 'yeoul'], ['서린', 'seorin'],
  ['라현', 'rahyeon'], ['미라', 'mira'], ['태겸', 'taegyeom'], ['윤호', 'yunho'], ['도윤', 'doyoon'],
]);

const params = new URLSearchParams(window.location.search);
const requestedReader = params.get('character') || params.get('reader') || 'baekheon';
const normalizedReader = aliases.get(requestedReader) || requestedReader.toLowerCase();
const readerKey = readerCatalog[normalizedReader] ? normalizedReader : 'baekheon';
const reader = readerCatalog[readerKey];
const route = resolveReadingDetailRoute(params);
const currentYear = new Date().getFullYear();

const root = document.body;
const routeState = document.querySelector('[data-reading-route-state]');
const stage = document.querySelector('[data-reading-stage]');
const productTitle = document.querySelector('[data-reading-product-title]');
const stateTitle = document.querySelector('[data-reading-state-title]');
const stateCopy = document.querySelector('[data-reading-state-copy]');

root.dataset.reader = readerKey;
root.dataset.readingRouteState = route.valid ? 'blocked_by_authority' : 'invalid';

if (route.valid) {
  root.dataset.readingTopicKey = route.topic;
  root.dataset.readingScopeKey = route.scope;
} else {
  delete root.dataset.readingTopicKey;
  delete root.dataset.readingScopeKey;
}

document.querySelectorAll('[data-reader-name]').forEach((element) => { element.textContent = reader.name; });
document.querySelectorAll('[data-reader-title]').forEach((element) => {
  element.textContent = reader.title;
  element.hidden = !reader.title;
});
document.querySelectorAll('[data-reader-intro]').forEach((element) => { element.textContent = reader.intro; });
document.querySelectorAll('[data-reader-hanja]').forEach((element) => {
  element.textContent = reader.hanja;
  element.hidden = !reader.hanja;
});

const portrait = document.querySelector('[data-reader-portrait]');
if (portrait) portrait.setAttribute('aria-label', `${reader.name} 사주 읽기 장면`);

function scopeDisplay(scope) {
  if (scope === 'year') return `${currentYear}년 · 올해`;
  if (scope === 'month') return '이번 달';
  return '원국';
}

function renderInvalidRoute() {
  if (productTitle) productTitle.textContent = '사주 읽기';
  if (stateTitle) stateTitle.textContent = '요청한 읽기를 찾을 수 없습니다.';
  if (stateCopy) {
    stateCopy.textContent = '지원하지 않는 사주 읽기 주소입니다. 전체 사주나 올해의 흐름으로 자동 대체하지 않았습니다.';
  }
  document.title = '읽기를 찾을 수 없음 · 명하';
}

function renderAuthorityBlockedRoute() {
  const scope = scopeDisplay(route.scope);
  if (productTitle) productTitle.textContent = route.topic === 'general' ? scope : `${route.label} · ${scope}`;
  if (stateTitle) stateTitle.textContent = `${route.label} 읽기는 아직 준비 중입니다.`;
  if (stateCopy) {
    stateCopy.textContent = '현재 제공 가능한 검증된 사주 읽기 범위가 열리지 않아 이 결과를 실행하지 않습니다. 다른 주제의 풀이로 대신 보여드리지 않습니다.';
  }
  document.querySelectorAll('[data-reading-scope]').forEach((element) => { element.textContent = scope; });
  document.title = `${route.label} · 사주 해석 · 명하`;
}

if (stage) stage.hidden = true;
if (routeState) routeState.hidden = false;

if (route.valid) {
  renderAuthorityBlockedRoute();
} else {
  renderInvalidRoute();
}
