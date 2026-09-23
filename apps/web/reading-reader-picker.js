const READER_PICKER_SELECTOR = '[data-reading-reader-picker]';
const READING_DETAIL_PATH = '/reading-detail.html';

const readers = Object.freeze([
  Object.freeze({
    key: 'seyeon',
    name: '세연',
    title: '무녀',
    tone: '부드럽게 흐름을 풀어 설명합니다.',
    portrait: 'assets/characters/seyeon-portrait-v2.webp',
  }),
  Object.freeze({
    key: 'baekheon',
    name: '백헌',
    title: '충추원의 장',
    tone: '구조와 선택을 단정하게 짚습니다.',
    portrait: 'assets/characters/baekheon-portrait-v2.webp',
  }),
  Object.freeze({
    key: 'yeoul',
    name: '여울',
    title: '설계관 기록관',
    tone: '돌려 말하지 않고 필요한 지점부터 봅니다.',
    portrait: 'assets/characters/yeoul-portrait-v2.webp',
  }),
  Object.freeze({
    key: 'seorin',
    name: '서린',
    title: '기억 서고지기',
    tone: '과거의 반복과 지금의 흐름을 연결해 봅니다.',
    portrait: 'assets/characters/seorin-portrait-v2.webp',
  }),
  Object.freeze({
    key: 'rahyeon',
    name: '라현',
    title: '대리자',
    tone: '겉보다 실제로 흔들리는 지점을 읽습니다.',
    portrait: 'assets/characters/rahyeon-portrait-v2.webp',
  }),
  Object.freeze({
    key: 'mira',
    name: '미라',
    title: '대리자',
    tone: '과장 없이 지금 쓸 수 있는 정보부터 봅니다.',
    portrait: 'assets/characters/mira-portrait-v2.webp',
  }),
  Object.freeze({
    key: 'taegyeom',
    name: '태겸',
    title: '대리자',
    tone: '낙관보다 확인되는 구조와 행동을 봅니다.',
    portrait: 'assets/characters/taegyeom-portrait-v2.webp',
  }),
  Object.freeze({
    key: 'yunho',
    name: '윤호',
    title: '대리자',
    tone: '구조와 시기를 차례대로 정리합니다.',
    portrait: 'assets/characters/yunho-portrait-v2.webp',
  }),
  Object.freeze({
    key: 'doyoon',
    name: '도윤',
    title: '대리자',
    tone: '복잡한 설명보다 걸리는 부분부터 시작합니다.',
    portrait: 'assets/characters/doyoon-portrait-v2.webp',
  }),
]);

let pendingReadingUrl = null;
let pendingLabel = '';

function isReadingDetailAnchor(anchor) {
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  const url = new URL(anchor.href, window.location.href);
  return url.origin === window.location.origin
    && url.pathname.endsWith(READING_DETAIL_PATH)
    && !url.searchParams.has('reader')
    && !url.searchParams.has('character');
}

function createPicker() {
  const existing = document.querySelector(READER_PICKER_SELECTOR);
  if (existing instanceof HTMLDialogElement) return existing;

  const dialog = document.createElement('dialog');
  dialog.className = 'reading-reader-picker';
  dialog.dataset.readingReaderPicker = '';

  const panel = document.createElement('div');
  panel.className = 'reading-reader-picker-panel';

  const close = document.createElement('button');
  close.className = 'reading-reader-picker-close';
  close.type = 'button';
  close.dataset.readerPickerClose = '';
  close.setAttribute('aria-label', 'Reader 선택 닫기');
  close.textContent = '×';

  const intro = document.createElement('div');
  intro.className = 'reading-reader-picker-intro';

  const kicker = document.createElement('span');
  kicker.className = 'reading-reader-picker-kicker';
  kicker.textContent = 'READER';

  const title = document.createElement('h2');
  title.id = 'reading-reader-picker-title';
  title.textContent = '어떤 Reader 장면으로 볼까요?';

  const copy = document.createElement('p');
  copy.textContent = '현재 프리뷰에서는 사주 근거와 해석 문장은 그대로 유지하고, 선택한 Reader의 장면과 이름만 화면 연출에 적용합니다.';

  const target = document.createElement('span');
  target.className = 'reading-reader-picker-target';
  target.dataset.readerPickerTarget = '';
  target.textContent = '선택한 사주 읽기';

  intro.append(kicker, title, copy, target);

  const grid = document.createElement('div');
  grid.className = 'reading-reader-picker-grid';
  grid.setAttribute('role', 'list');

  for (const reader of readers) {
    const button = document.createElement('button');
    button.className = 'reading-reader-option';
    button.type = 'button';
    button.dataset.readerKey = reader.key;
    button.setAttribute('role', 'listitem');
    button.setAttribute('aria-label', `${reader.name}에게 읽기 맡기기`);

    const art = document.createElement('span');
    art.className = 'reading-reader-option-art';

    const image = document.createElement('img');
    image.src = reader.portrait;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    art.append(image);

    const body = document.createElement('span');
    body.className = 'reading-reader-option-copy';

    const heading = document.createElement('span');
    heading.className = 'reading-reader-option-heading';

    const name = document.createElement('strong');
    name.textContent = reader.name;

    const readerTitle = document.createElement('small');
    readerTitle.textContent = reader.title;

    heading.append(name, readerTitle);


    const tone = document.createElement('span');
    tone.className = 'reading-reader-option-tone';
    tone.textContent = reader.tone;

    const action = document.createElement('span');
    action.className = 'reading-reader-option-action';
    action.textContent = '이 장면으로 보기 →';

    body.append(heading, tone, action);
    button.append(art, body);
    grid.append(button);
  }

  const note = document.createElement('p');
  note.className = 'reading-reader-picker-note';
  note.textContent = '이 선택은 프리뷰 화면 연출에만 적용됩니다. 저장된 풀이를 다시 읽거나 대화를 이어가는 Reader는 서버에서 연결 가능한 상태가 확인된 뒤 별도로 표시됩니다.';

  panel.append(close, intro, grid, note);
  dialog.append(panel);
  dialog.setAttribute('aria-labelledby', title.id);
  document.body.append(dialog);

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('backdrop');
  });

  close.addEventListener('click', () => dialog.close('close'));

  dialog.addEventListener('close', () => {
    if (dialog.returnValue !== 'reader-selected') {
      pendingReadingUrl = null;
      pendingLabel = '';
    }
  });

  dialog.addEventListener('click', (event) => {
    const button = event.target instanceof Element
      ? event.target.closest('[data-reader-key]')
      : null;
    if (!(button instanceof HTMLButtonElement) || !pendingReadingUrl) return;

    const readerKey = button.dataset.readerKey;
    if (!readerKey || !readers.some((reader) => reader.key === readerKey)) return;

    const next = new URL(pendingReadingUrl.href);
    next.searchParams.set('reader', readerKey);
    dialog.close('reader-selected');
    window.location.assign(next.href);
  });

  return dialog;
}

function openPicker(anchor) {
  const dialog = createPicker();
  pendingReadingUrl = new URL(anchor.href, window.location.href);
  pendingLabel = anchor.textContent?.replace(/\s+/gu, ' ').trim() || '선택한 사주 읽기';

  const target = dialog.querySelector('[data-reader-picker-target]');
  if (target) target.textContent = pendingLabel;

  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    // No modal means no explicit Reader presentation choice was made.
    // Continue without manufacturing a browser Reader hint.
    window.location.assign(pendingReadingUrl.href);
    return;
  }

  const firstReader = dialog.querySelector('[data-reader-key]');
  if (firstReader instanceof HTMLButtonElement) firstReader.focus();
}

document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!isReadingDetailAnchor(anchor)) return;

  event.preventDefault();
  openPicker(anchor);
});
