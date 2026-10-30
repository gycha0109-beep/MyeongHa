import { normalizeUiLocale } from './ui-i18n.js';

// User-entered values, stored official Reading and Life Fact data are never translated here.
const COPY = Object.freeze({
  'ko-KR': Object.freeze({
    reportCount: (count) => `보관된 기록 ${count}건`,
    delivered: (date, title) => `${date}에 본 ${title} 기록입니다. 저장된 공식 풀이를 그대로 다시 열 수 있습니다.`,
    pending: (date, title) => `${date}의 ${title} 기록입니다. 완료된 Official Reading만 다시 열 수 있습니다.`,
  }),
  'ja-JP': Object.freeze({
    reportCount: (count) => `保存された記録 ${count}件`,
    delivered: (date, title) => `${date}に鑑定した「${title}」の記録です。保存済みの公式鑑定を変更せずに再度開けます。`,
    pending: (date, title) => `${date}の「${title}」の記録です。完了したOfficial Readingのみ再度開けます。`,
  }),
  'en-US': Object.freeze({
    reportCount: (count) => `${count} saved ${count === 1 ? 'record' : 'records'}`,
    delivered: (date, title) => `${date} · ${title}. You can reopen the saved official reading unchanged.`,
    pending: (date, title) => `${date} · ${title}. Only completed Official Reading records can be reopened.`,
  }),
  'zh-CN': Object.freeze({
    reportCount: (count) => `已保存 ${count} 条记录`,
    delivered: (date, title) => `${date}的「${title}」解读记录。可原样重新打开已保存的正式解读。`,
    pending: (date, title) => `${date}的「${title}」解读记录。仅已完成的 Official Reading 可以重新打开。`,
  }),
  'zh-TW': Object.freeze({
    reportCount: (count) => `已儲存 ${count} 筆紀錄`,
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

export function recordsReadingSummaryV1({ completedAt, title, openable }, locale = 'ko-KR') {
  const date = recordsTimestampV1(completedAt, locale);
  return openable ? copy(locale).delivered(date, title) : copy(locale).pending(date, title);
}

/** Count comes exclusively from the current subject's authorized Reading History. */
export function recordsReportCountV1(count, locale = 'ko-KR') {
  if (!Number.isSafeInteger(count) || count < 0) throw new TypeError('Invalid saved Reading count');
  return copy(locale).reportCount(count);
}
