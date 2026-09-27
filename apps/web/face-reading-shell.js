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

let objectUrl = null;

function humanSize(bytes) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + 'KB';
  return (bytes / 1024 / 1024).toFixed(1) + 'MB';
}

function resetPreview() {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  image.hidden = true;
  image.removeAttribute('src');
  placeholder.hidden = false;
  corners.hidden = true;
  fileCard.hidden = true;
  analyze.disabled = true;
  analyze.firstChild.textContent = '얼굴 확인 준비 중 ';
  description.textContent = '촬영하거나 앨범에서 사진을 선택하면 얼굴 구조 확인을 시작할 준비를 합니다.';
}

function choose(file) {
  if (!file) return;
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!allowed.has(file.type) || file.size <= 0 || file.size > 16 * 1024 * 1024) {
    resetPreview();
    description.textContent = 'JPEG, PNG 또는 WebP 형식의 16MB 이하 사진을 선택해주세요.';
    return;
  }
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  image.src = objectUrl;
  image.hidden = false;
  placeholder.hidden = true;
  corners.hidden = false;
  fileCard.hidden = false;
  fileName.textContent = file.name || '선택한 사진';
  fileMeta.textContent = humanSize(file.size) + ' · 브라우저 미리보기 준비됨';
  analyze.disabled = true;
  analyze.firstChild.textContent = '분석 엔진 연결 준비 중 ';
  description.textContent = '사진이 준비되었습니다. 관상 엔진 연결이 완료되면 이 화면에서 바로 분석을 시작합니다.';
}

cameraButton?.addEventListener('click', () => camera?.click());
galleryButton?.addEventListener('click', () => gallery?.click());
camera?.addEventListener('change', event => choose(event.currentTarget.files?.[0] ?? null));
gallery?.addEventListener('change', event => choose(event.currentTarget.files?.[0] ?? null));
window.addEventListener('beforeunload', () => { if (objectUrl) URL.revokeObjectURL(objectUrl); });
