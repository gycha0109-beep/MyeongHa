import { resolveCharacterDisplayNameV1 } from './character-display-locale.js';
import { READER_PRESENTATIONS, findReaderPresentation } from './reader-presentation-catalog.js';
import { createDelegatePicker } from './reader-picker-dialog.js';
import { faceReadingUiStateV1 } from './face-reading-ui-locale.js';
import { getUiLocale, translateStaticUi } from './ui-i18n.js';

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
let previewPhase = 'idle';

function resolveInitialReader() {
  const readerKey = new URL(window.location.href).searchParams.get('reader');
  return findReaderPresentation(readerKey) ?? READER_PRESENTATIONS[0];
}

let selectedReader = resolveInitialReader();
function updateReaderUrl(readerKey) {
  const url = new URL(window.location.href);
  url.searchParams.set('reader', readerKey);
  window.history.replaceState(window.history.state, '', url);
}

function renderReader() {
  document.body.dataset.reader = selectedReader.key;

  for (const node of readerNameNodes) {
    node.textContent = (resolveCharacterDisplayNameV1(selectedReader.key, getUiLocale()) ?? selectedReader.name);
  }

  if (readerPortrait instanceof HTMLImageElement) {
    readerPortrait.src = selectedReader.portrait;
    readerPortrait.alt = '';
  }

  if (readerTitle) readerTitle.textContent = translateStaticUi(selectedReader.title, getUiLocale());
  if (readerTone) readerTone.textContent = translateStaticUi(selectedReader.tone, getUiLocale());

  const ui = faceReadingUiStateV1({
    readerKey: selectedReader.key,
    readerFallback: selectedReader.name,
    phase: previewPhase,
    fileName: selectedFile?.name,
    fileSize: selectedFile?.size,
  }, getUiLocale());

  if (description) description.textContent = ui.description;
  if (analyzeLabel) analyzeLabel.textContent = ui.analyzeLabel;
  if (statusTitle) statusTitle.textContent = ui.statusTitle;
  if (statusCopy) statusCopy.textContent = ui.statusCopy;
  if (selectedFile) {
    if (fileName) fileName.textContent = ui.fileName;
    if (fileMeta) fileMeta.textContent = ui.fileMeta;
  }
}

function setIdlePreview() {
  selectedFile = null;
  previewPhase = 'idle';
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

function rejectPreview(phase) {
  resetPreview();
  previewPhase = phase;
  renderReader();
}

function showSelectedFile(file) {
  selectedFile = file;
  previewPhase = 'ready';
  placeholder.hidden = true;
  corners.hidden = false;
  fileCard.hidden = false;
  analyze.disabled = true;
  renderReader();
}

function choose(file) {
  if (!file) return;

  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!allowed.has(file.type) || file.size <= 0 || file.size > 16 * 1024 * 1024) {
    rejectPreview('invalid-file');
    return;
  }

  const revision = ++selectionRevision;
  setIdlePreview();
  previewPhase = 'loading';
  renderReader();

  const reader = new FileReader();

  reader.onerror = () => {
    if (revision !== selectionRevision) return;
    rejectPreview('read-error');
  };

  reader.onload = () => {
    if (revision !== selectionRevision) return;

    const source = typeof reader.result === 'string' ? reader.result : '';
    if (!source.startsWith('data:image/')) {
      rejectPreview('invalid-image');
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
      rejectPreview('image-error');
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

let delegatePicker = null;

function openReaderPicker() {
  if (!delegatePicker) {
    delegatePicker = createDelegatePicker({
      titleId: 'face-reader-picker-title',
      description: '관상 결과 자체는 연결자에 따라 바뀌지 않습니다. 확인된 결과를 무엇부터 보고 어떤 말투로 풀어주는지가 달라집니다.',
      targetLabel: '관상 · 연결자 선택',
      note: '연결자는 확인된 관상 결과의 전달 방식과 대화 경험을 맡습니다. 연결자 선택이 관상 의미 자체를 새로 만들거나 바꾸지는 않습니다.',
      resolveOption: (reader) => ({
        selectable: true,
        title: reader.title,
        tone: reader.tone,
        action: '이 연결자와 보기 →',
        ariaLabel: reader.name + '과 함께 관상 보기',
      }),
      onSelect(reader) {
        selectedReader = reader;
        updateReaderUrl(reader.key);
        renderReader();
      },
    });
    delegatePicker.dialog.dataset.faceReaderPicker = '';
  }
  delegatePicker.open({ selectedKey: selectedReader.key });
}

cameraButton?.addEventListener('click', () => openPhotoPicker(camera));
galleryButton?.addEventListener('click', () => openPhotoPicker(gallery));
camera?.addEventListener('change', event => choose(event.currentTarget.files?.[0] ?? null));
gallery?.addEventListener('change', event => choose(event.currentTarget.files?.[0] ?? null));
readerChangeButton?.addEventListener('click', openReaderPicker);

renderReader();

// Recompose reader-dependent static labels when the display language changes.
document.addEventListener('myeongha:localechange', () => renderReader());
