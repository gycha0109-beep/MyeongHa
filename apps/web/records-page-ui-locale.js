import { normalizeUiLocale } from './ui-i18n.js';

// User-entered values, stored official Reading and Life Fact data are never translated here.
const COPY = Object.freeze({
  'ko-KR': Object.freeze({
    birthUnavailable: '현재 출생 정보를 불러오지 못했습니다. 확인되지 않은 정보는 대신 보여드리지 않습니다.',
    revision: (number) => `현재 입력 · revision ${number}`,
    delivered: (date, title) => `${date}에 본 ${title} 기록입니다. 저장된 공식 풀이를 그대로 다시 열 수 있습니다.`,
    pending: (date, title) => `${date}의 ${title} 기록입니다. 완료된 Official Reading만 다시 열 수 있습니다.`,
  }),
  'ja-JP': Object.freeze({
    birthUnavailable: '現在の出生情報を読み込めません。未確認の情報を代わりに表示することはありません。',
    revision: (number) => `現在の入力 · revision ${number}`,
    delivered: (date, title) => `${date}に鑑定した「${title}」の記録です。保存済みの公式鑑定を変更せずに再度開けます。`,
    pending: (date, title) => `${date}の「${title}」の記録です。完了したOfficial Readingのみ再度開けます。`,
  }),
  'zh-TW': Object.freeze({
    birthUnavailable: '目前無法載入出生資料，不會以未經確認的資訊替代顯示。',
    revision: (number) => `目前輸入 · revision ${number}`,
    delivered: (date, title) => `${date}的「${title}」解讀紀錄。可原樣重新開啟已儲存的正式解讀。`,
    pending: (date, title) => `${date}的「${title}」解讀紀錄。僅已完成的 Official Reading 可重新開啟。`,
  }),
});

function copy(locale) {
  return COPY[normalizeUiLocale(locale)] ?? COPY['ko-KR'];
}

export function recordsTimestampV1(value, locale = 'ko-KR') {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat(normalizeUiLocale(locale), {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value));
}

export function recordsBirthUnavailableV1(locale = 'ko-KR') {
  return copy(locale).birthUnavailable;
}

export function recordsBirthRevisionV1(revisionNo, locale = 'ko-KR') {
  return copy(locale).revision(revisionNo);
}

export function recordsReadingSummaryV1({ completedAt, title, openable }, locale = 'ko-KR') {
  const date = recordsTimestampV1(completedAt, locale);
  return openable ? copy(locale).delivered(date, title) : copy(locale).pending(date, title);
}
