import { READER_PRESENTATIONS, findReaderPresentation } from './reader-presentation-catalog.js';
import { createDelegatePicker } from './reader-picker-dialog.js';

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

let delegatePicker = null;

function openReaderPicker() {
  if (!delegatePicker) {
    delegatePicker = createDelegatePicker({
      titleId: 'face-reader-picker-title',
      description: '관상 결과 자체는 대리자에 따라 바뀌지 않습니다. 확인된 결과를 무엇부터 보고 어떤 말투로 풀어주는지가 달라집니다.',
      targetLabel: '관상 · 대리자 선택',
      note: '대리자는 확인된 관상 결과의 전달 방식과 대화 경험을 맡습니다. 대리자 선택이 관상 의미 자체를 새로 만들거나 바꾸지는 않습니다.',
      resolveOption: (reader) => ({
        selectable: true,
        title: reader.title,
        tone: reader.tone,
        action: '이 대리자와 보기 →',
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
