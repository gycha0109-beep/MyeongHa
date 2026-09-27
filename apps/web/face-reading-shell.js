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
const description = document.querySelector('[data-face-description]');

let selectionRevision = 0;

function humanSize(bytes) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + 'KB';
  return (bytes / 1024 / 1024).toFixed(1) + 'MB';
}

function setIdlePreview() {
  image.onload = null;
  image.onerror = null;
  image.hidden = true;
  image.removeAttribute('src');
  placeholder.hidden = false;
  corners.hidden = true;
  fileCard.hidden = true;
  analyze.disabled = true;
  analyze.firstChild.textContent = '얼굴 확인 준비 중 ';
}

function resetPreview() {
  selectionRevision += 1;
  setIdlePreview();
  camera.value = '';
  gallery.value = '';
  description.textContent = '촬영하거나 앨범에서 사진을 선택하면 얼굴 구조 확인을 시작할 준비를 합니다.';
}

function rejectPreview(message) {
  resetPreview();
  description.textContent = message;
}

function showSelectedFile(file) {
  placeholder.hidden = true;
  corners.hidden = false;
  fileCard.hidden = false;
  fileName.textContent = file.name || '선택한 사진';
  fileMeta.textContent = humanSize(file.size) + ' · 브라우저 미리보기 준비됨';
  analyze.disabled = true;
  analyze.firstChild.textContent = '분석 엔진 연결 준비 중 ';
  description.textContent = '사진이 준비되었습니다. 관상 엔진 연결이 완료되면 이 화면에서 바로 분석을 시작합니다.';
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

function openPicker(input) {
  if (!input) return;
  input.value = '';
  input.click();
}

cameraButton?.addEventListener('click', () => openPicker(camera));
galleryButton?.addEventListener('click', () => openPicker(gallery));
camera?.addEventListener('change', event => choose(event.currentTarget.files?.[0] ?? null));
gallery?.addEventListener('change', event => choose(event.currentTarget.files?.[0] ?? null));
