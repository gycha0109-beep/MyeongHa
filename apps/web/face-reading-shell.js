import { READER_PRESENTATIONS, findReaderPresentation } from './reader-presentation-catalog.js';

const camera = document.querySelector('[data-face-camera]');
const gallery = document.querySelector('[data-face-gallery]');
const cameraButton = document.querySelector('[data-face-camera-button]');
const galleryButton = document.querySelector('[data-face-gallery-button]');
const image = document.querySelector('[data-face-image]');
const placeholder = document.querySelector('[data-face-placeholder]');
const corners = document.querySelector('[data-face-corners]');
const fileCard = document.querySelector('[data-face-file-card]');
const fileName = document.querySelector('[data-face-file-name]');
const fileMeta = document.querySelector('[data-face-file-meta]');
const analyze = document.querySelector('[data-face-analyze]');
const analyzeLabel = document.querySelector('[data-face-analyze-label]');
const description = document.querySelector('[data-face-description]');
const readerChangeButton = document.querySelector('[data-face-reader-change]');
const readerPortrait = document.querySelector('[data-face-reader-portrait]');
const readerTitle = document.querySelector('[data-face-reader-title]');
const readerTone = document.querySelector('[data-face-reader-tone]');
const readerNameNodes = document.querySelectorAll('[data-face-reader-name]');
const statusTitle = document.querySelector('[data-face-status-title]');
const statusCopy = document.querySelector('[data-face-status-copy]');

let selectionRevision = 0;
let selectedFile = null;

function resolveInitialReader() {
  const readerKey = new URL(window.location.href).searchParams.get('reader');
  return findReaderPresentation(readerKey) ?? READER_PRESENTATIONS[0];
}

let selectedReader = resolveInitialReader();

function humanSize(bytes) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + 'KB';
  return (bytes / 1024 / 1024).toFixed(1) + 'MB';
}

function updateReaderUrl(readerKey) {
  const url = new URL(window.location.href);
  url.searchParams.set('reader', readerKey);
  window.history.replaceState(window.history.state, '', url);
}

function renderReader() {
  document.body.dataset.reader = selectedReader.key;

  for (const node of readerNameNodes) {
    node.textContent = selectedReader.name;
  }

  if (readerPortrait instanceof HTMLImageElement) {
    readerPortrait.src = selectedReader.portrait;
    readerPortrait.alt = '';
  }

  if (readerTitle) readerTitle.textContent = selectedReader.title;
  if (readerTone) readerTone.textContent = selectedReader.tone;

  if (selectedFile) {
    if (description) {
      description.textContent = `사진이 준비되었습니다. ${selectedReader.name}과 함께 얼굴 구조 확인부터 이어갈 준비가 되었습니다.`;
    }
    if (analyzeLabel) analyzeLabel.textContent = `${selectedReader.name}에게 보여주기 준비 중`;
    if (statusTitle) statusTitle.textContent = `${selectedReader.name}과 관상 보기 준비됨`;
    if (statusCopy) {
      statusCopy.textContent = '사진 준비를 마쳤습니다. 얼굴 구조 확인 기능이 연결되면 선택한 대리자의 풀이로 이어집니다.';
    }
  } else {
    if (description) {
      description.textContent = `정면에서 얼굴이 잘 보이는 사진을 준비해주세요. ${selectedReader.name}과 함께 얼굴 구조 확인부터 시작합니다.`;
    }
    if (analyzeLabel) analyzeLabel.textContent = '사진을 먼저 준비해주세요';
    if (statusTitle) statusTitle.textContent = `${selectedReader.name}과 관상 보기`;
    if (statusCopy) {
      statusCopy.textContent = '사진을 준비하면 얼굴 구조를 확인한 뒤 선택한 대리자의 풀이로 이어집니다.';
    }
  }
}

function setIdlePreview() {
  selectedFile = null;
  image.onload = null;
  image.onerror = null;
  image.hidden = true;
  image.removeAttribute('src');
  placeholder.hidden = false;
  corners.hidden = true;
  fileCard.hidden = true;
  analyze.disabled = true;
  renderReader();
}

function resetPreview() {
  selectionRevision += 1;
  setIdlePreview();
  camera.value = '';
  gallery.value = '';
}

function rejectPreview(message) {
  resetPreview();
  description.textContent = message;
}

function showSelectedFile(file) {
  selectedFile = file;
  placeholder.hidden = true;
  corners.hidden = false;
  fileCard.hidden = false;
  fileName.textContent = file.name || '선택한 사진';
  fileMeta.textContent = humanSize(file.size) + ' · 브라우저 미리보기 준비됨';
  analyze.disabled = true;
  renderReader();
}

function choose(file) {
  if (!file) return;

  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!allowed.has(file.type) || file.size <= 0 || file.size > 16 * 1024 * 1024) {
    rejectPreview('JPEG, PNG 또는 WebP 형식의 16MB 이하 사진을 선택해주세요.');
    return;
  }

  const revision = ++selectionRevision;
  setIdlePreview();
  description.textContent = '사진을 불러오고 있습니다.';

  const reader = new FileReader();

  reader.onerror = () => {
    if (revision !== selectionRevision) return;
    rejectPreview('사진을 불러오지 못했습니다. 다른 사진을 선택해주세요.');
  };

  reader.onload = () => {
    if (revision !== selectionRevision) return;

    const source = typeof reader.result === 'string' ? reader.result : '';
    if (!source.startsWith('data:image/')) {
      rejectPreview('사진을 표시할 수 없습니다. 다른 사진을 선택해주세요.');
      return;
    }

    image.onload = () => {
      if (revision !== selectionRevision) return;
      image.onload = null;
      image.onerror = null;
      image.hidden = false;
      showSelectedFile(file);
    };

    image.onerror = () => {
      if (revision !== selectionRevision) return;
      rejectPreview('사진을 표시할 수 없습니다. 손상되지 않은 JPEG, PNG 또는 WebP 사진을 선택해주세요.');
    };

    image.src = source;
  };

  reader.readAsDataURL(file);
}

function openPhotoPicker(input) {
  if (!input) return;
  input.value = '';
  input.click();
}

function createReaderPicker() {
  const existing = document.querySelector('[data-face-reader-picker]');
  if (existing instanceof HTMLDialogElement) return existing;

  const dialog = document.createElement('dialog');
  dialog.className = 'reading-reader-picker face-reader-picker';
  dialog.dataset.faceReaderPicker = '';

  const panel = document.createElement('div');
  panel.className = 'reading-reader-picker-panel';

  const close = document.createElement('button');
  close.className = 'reading-reader-picker-close';
  close.type = 'button';
  close.setAttribute('aria-label', '대리자 선택 닫기');
  close.textContent = '×';

  const intro = document.createElement('div');
  intro.className = 'reading-reader-picker-intro';

  const kicker = document.createElement('span');
  kicker.className = 'reading-reader-picker-kicker';
  kicker.textContent = '대리자';

  const title = document.createElement('h2');
  title.id = 'face-reader-picker-title';
  title.textContent = '어떤 대리자와 함께 볼까요?';

  const copy = document.createElement('p');
  copy.textContent = '관상 결과 자체는 대리자에 따라 바뀌지 않습니다. 확인된 결과를 무엇부터 보고 어떤 말투로 풀어주는지가 달라집니다.';

  const target = document.createElement('span');
  target.className = 'reading-reader-picker-target';
  target.textContent = '관상 · 대리자 선택';

  intro.append(kicker, title, copy, target);

  const tools = document.createElement('div');
  tools.className = 'face-reader-picker-tools';

  const search = document.createElement('input');
  search.className = 'face-reader-picker-search';
  search.type = 'search';
  search.placeholder = '이름이나 설명으로 대리자 찾기';
  search.setAttribute('aria-label', '대리자 검색');
  tools.append(search);

  const grid = document.createElement('div');
  grid.className = 'reading-reader-picker-grid';
  grid.setAttribute('role', 'list');

  for (const reader of READER_PRESENTATIONS) {
    const button = document.createElement('button');
    button.className = 'reading-reader-option';
    button.type = 'button';
    button.dataset.readerKey = reader.key;
    button.dataset.readerSearch = `${reader.name} ${reader.title} ${reader.tone}`.toLocaleLowerCase('ko-KR');
    button.setAttribute('role', 'listitem');
    button.setAttribute('aria-label', `${reader.name}과 함께 관상 보기`);

    const art = document.createElement('span');
    art.className = 'reading-reader-option-art';

    const portrait = document.createElement('img');
    portrait.src = reader.portrait;
    portrait.alt = '';
    portrait.loading = 'lazy';
    portrait.decoding = 'async';
    art.append(portrait);

    const body = document.createElement('span');
    body.className = 'reading-reader-option-copy';

    const heading = document.createElement('span');
    heading.className = 'reading-reader-option-heading';

    const name = document.createElement('strong');
    name.textContent = reader.name;

    const subtitle = document.createElement('small');
    subtitle.textContent = reader.title;
    heading.append(name, subtitle);

    const tone = document.createElement('span');
    tone.className = 'reading-reader-option-tone';
    tone.textContent = reader.tone;

    const action = document.createElement('span');
    action.className = 'reading-reader-option-action';
    action.textContent = '이 대리자와 보기 →';

    body.append(heading, tone, action);
    button.append(art, body);
    grid.append(button);
  }

  const empty = document.createElement('p');
  empty.className = 'face-reader-picker-empty';
  empty.hidden = true;
  empty.textContent = '검색과 일치하는 대리자가 없습니다.';

  const note = document.createElement('p');
  note.className = 'reading-reader-picker-note';
  note.textContent = '대리자는 확인된 관상 결과의 전달 방식과 대화 경험을 맡습니다. 대리자 선택이 관상 의미 자체를 새로 만들거나 바꾸지는 않습니다.';

  panel.append(close, intro, tools, grid, empty, note);
  dialog.append(panel);
  dialog.setAttribute('aria-labelledby', title.id);
  document.body.append(dialog);

  function refreshSelectedState() {
    for (const option of grid.querySelectorAll('[data-reader-key]')) {
      if (!(option instanceof HTMLButtonElement)) continue;
      const isSelected = option.dataset.readerKey === selectedReader.key;
      option.classList.toggle('is-selected', isSelected);
      option.setAttribute('aria-pressed', String(isSelected));
    }
  }

  function filterReaders() {
    const query = search.value.trim().toLocaleLowerCase('ko-KR');
    let visible = 0;

    for (const option of grid.querySelectorAll('[data-reader-key]')) {
      if (!(option instanceof HTMLButtonElement)) continue;
      const matches = query === '' || (option.dataset.readerSearch ?? '').includes(query);
      option.hidden = !matches;
      if (matches) visible += 1;
    }

    empty.hidden = visible !== 0;
  }

  search.addEventListener('input', filterReaders);

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('backdrop');
  });

  close.addEventListener('click', () => dialog.close('close'));

  grid.addEventListener('click', (event) => {
    const button = event.target instanceof Element
      ? event.target.closest('[data-reader-key]')
      : null;
    if (!(button instanceof HTMLButtonElement)) return;

    const nextReader = findReaderPresentation(button.dataset.readerKey);
    if (!nextReader) return;

    selectedReader = nextReader;
    updateReaderUrl(nextReader.key);
    renderReader();
    dialog.close('reader-selected');
  });

  dialog.addEventListener('close', () => {
    search.value = '';
    filterReaders();
  });

  dialog.addEventListener('face-reader-picker-open', refreshSelectedState);

  dialog.refreshSelectedState = refreshSelectedState;
  return dialog;
}

function openReaderPicker() {
  const dialog = createReaderPicker();
  if (typeof dialog.refreshSelectedState === 'function') dialog.refreshSelectedState();

  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }

  const selected = dialog.querySelector(`[data-reader-key="${selectedReader.key}"]`);
  if (selected instanceof HTMLButtonElement) selected.focus();
}

cameraButton?.addEventListener('click', () => openPhotoPicker(camera));
galleryButton?.addEventListener('click', () => openPhotoPicker(gallery));
camera?.addEventListener('change', event => choose(event.currentTarget.files?.[0] ?? null));
gallery?.addEventListener('change', event => choose(event.currentTarget.files?.[0] ?? null));
readerChangeButton?.addEventListener('click', openReaderPicker);

renderReader();
