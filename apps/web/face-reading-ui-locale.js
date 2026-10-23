import { resolveCharacterDisplayNameV1 } from './character-display-locale.js';
import { formatStaticUi, normalizeUiLocale, translateStaticUi } from './ui-i18n.js';

// Photo preparation is UI-only. No Face provider, analysis or result authority is invoked.
const FEEDBACK = Object.freeze({
  loading: '사진을 불러오고 있습니다.',
  'invalid-file': 'JPEG, PNG 또는 WebP 형식의 16MB 이하 사진을 선택해주세요.',
  'read-error': '사진을 불러오지 못했습니다. 다른 사진을 선택해주세요.',
  'invalid-image': '사진을 표시할 수 없습니다. 다른 사진을 선택해주세요.',
  'image-error': '사진을 표시할 수 없습니다. 손상되지 않은 JPEG, PNG 또는 WebP 사진을 선택해주세요.',
});

function humanSize(bytes) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + 'KB';
  return (bytes / 1024 / 1024).toFixed(1) + 'MB';
}

export function faceReadingUiStateV1({
  readerKey, readerFallback = '', phase = 'idle', fileName = '', fileSize = 0,
}, locale = 'ko-KR') {
  const safeLocale = normalizeUiLocale(locale);
  const reader = resolveCharacterDisplayNameV1(readerKey, safeLocale) ?? readerFallback;
  const text = (source) => translateStaticUi(source, safeLocale);
  const phrase = (source) => formatStaticUi(source, { reader }, safeLocale);
  const ready = phase === 'ready';

  return {
    description: ready
      ? phrase('사진이 준비되었습니다. {reader}과 함께 얼굴 구조 확인부터 이어갈 준비가 되었습니다.')
      : FEEDBACK[phase]
        ? text(FEEDBACK[phase])
        : phrase('정면에서 얼굴이 잘 보이는 사진을 준비해주세요. {reader}과 함께 얼굴 구조 확인부터 시작합니다.'),
    analyzeLabel: ready ? phrase('{reader}에게 보여주기 준비 중') : text('사진을 먼저 준비해주세요'),
    statusTitle: ready ? phrase('{reader}과 관상 보기 준비됨') : phrase('{reader}과 관상 보기'),
    statusCopy: ready
      ? text('사진 준비를 마쳤습니다. 얼굴 구조 확인 기능이 연결되면 선택한 연결자의 풀이로 이어집니다.')
      : text('사진을 준비하면 얼굴 구조를 확인한 뒤 선택한 연결자의 풀이로 이어집니다.'),
    fileName: fileName || text('선택한 사진'),
    fileMeta: ready ? humanSize(fileSize) + ' · ' + text('미리보기 준비됨') : '',
  };
}
