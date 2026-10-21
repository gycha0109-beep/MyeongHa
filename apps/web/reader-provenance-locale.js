import { resolveCharacterDisplayNameV1 } from './character-display-locale.js';

export function readerProvenanceLocaleLabelV1(ids, locale = 'ko-KR') {
  const language = ['ko-KR', 'ja-JP', 'zh-TW'].includes(locale) ? locale : 'ko-KR';
  if (!Array.isArray(ids) || ids.length === 0) {
    if (language === 'ja-JP') return 'Readerの記録なし';
    if (language === 'zh-TW') return '尚無 Reader 紀錄';
    return 'Reader 기록 없음';
  }
  const unknown = language === 'ko-KR' ? '대리자' : '代理人';
  const names = ids.map(id => resolveCharacterDisplayNameV1(id, language) ?? unknown);
  const joined = names.join(' · ');
  if (language === 'ja-JP') return joined + 'による鑑定';
  if (language === 'zh-TW') return joined + '的解讀';
  return joined + '에게';
}
