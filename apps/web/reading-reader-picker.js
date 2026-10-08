import { readerRolloutPresentationV1 } from './reader-rollout-policy.js';
import { createDelegatePicker } from './reader-picker-dialog.js';

const READING_DETAIL_PATH = '/reading-detail.html';
let pendingReadingUrl = null;
let picker = null;

function isReadingDetailAnchor(anchor) {
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  const url = new URL(anchor.href, window.location.href);
  return url.origin === window.location.origin
    && url.pathname.endsWith(READING_DETAIL_PATH)
    && !url.searchParams.has('reader')
    && !url.searchParams.has('character');
}

function createPicker() {
  if (picker) return picker;
  picker = createDelegatePicker({
    titleId: 'reading-reader-picker-title',
    description: '현재 프리뷰에서는 사주 근거와 해석 문장은 그대로 유지하고, 선택한 대리자의 장면과 이름만 화면 연출에 적용합니다.',
    targetLabel: '선택한 사주 읽기',
    note: '현재 세연만 프리뷰 장면을 선택할 수 있습니다. 이 선택은 프리뷰 화면 연출에만 적용됩니다. 저장된 풀이를 다시 읽거나 대화를 이어가는 대리자는 서버에서 연결 가능한 상태가 확인된 뒤 별도로 표시됩니다. 유료 대리자 해석은 아직 공개되지 않았습니다.',
    resolveOption(reader) {
      const rollout = readerRolloutPresentationV1(reader.key);
      return {
        stage: rollout.stage,
        selectable: rollout.previewSelectable,
        title: rollout.previewSelectable ? reader.title : '컨셉 정리 중',
        tone: rollout.previewSelectable ? reader.tone : '설정 확정 후 순차적으로 공개합니다.',
        action: rollout.previewSelectable ? '프리뷰 장면 보기 →' : '준비 중',
        ariaLabel: rollout.previewSelectable
          ? reader.name + ' 프리뷰 장면 선택'
          : reader.name + ' 대리자 준비 중',
      };
    },
    onSelect(reader) {
      if (!pendingReadingUrl || !readerRolloutPresentationV1(reader.key).previewSelectable) return;
      const next = new URL(pendingReadingUrl.href);
      next.searchParams.set('reader', reader.key);
      window.location.assign(next.href);
    },
  });
  picker.dialog.dataset.readingReaderPicker = '';
  picker.dialog.addEventListener('close', () => {
    if (picker.dialog.returnValue !== 'reader-selected') pendingReadingUrl = null;
  });
  return picker;
}

function openPicker(anchor) {
  const current = createPicker();
  pendingReadingUrl = new URL(anchor.href, window.location.href);
  const targetText = anchor.textContent?.replace(/\s+/gu, ' ').trim() || '선택한 사주 읽기';

  if (typeof current.dialog.showModal !== 'function') {
    // No explicit choice was made. Keep the existing route without a Reader hint.
    window.location.assign(pendingReadingUrl.href);
    return;
  }
  current.open({ targetText });
}

document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!isReadingDetailAnchor(anchor)) return;
  event.preventDefault();
  openPicker(anchor);
});
