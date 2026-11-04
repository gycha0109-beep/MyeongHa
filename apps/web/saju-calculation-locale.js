// Presentation-only projections of server-resolved Saju facts.
// The engine's pillars, uncertainty, element counts, and provenance are never changed.
export const SAJU_DISPLAY_LOCALES_V1 = Object.freeze(['ko-KR', 'ja-JP', 'zh-TW', 'en-US', 'zh-CN']);
const PILLARS = Object.freeze({
  year: Object.freeze(['년주', '年柱', '年柱']),
  month: Object.freeze(['월주', '月柱', '月柱']),
  day: Object.freeze(['일주', '日柱', '日柱']),
  hour: Object.freeze(['시주', '時柱', '時柱']),
});
const ELEMENTS = Object.freeze({
  목: '木', 화: '火', 토: '土', 금: '金', 수: '水',
});
const YINYANG = Object.freeze({ 음: '陰', 양: '陽' });

const PILLAR_EN_CN = Object.freeze({
  year: ['Year pillar', '年柱'], month: ['Month pillar', '月柱'],
  day: ['Day pillar', '日柱'], hour: ['Hour pillar', '时柱'],
});
const ELEMENTS_EN = Object.freeze({ 목: 'Wood', 화: 'Fire', 토: 'Earth', 금: 'Metal', 수: 'Water' });
const YINYANG_EN = Object.freeze({ 음: 'Yin', 양: 'Yang' });
const YINYANG_CN = Object.freeze({ 음: '阴', 양: '阳' });
const STATUS_EN_CN = Object.freeze({
  '복수 후보': ['Multiple candidates', '多个候选结果'],
  '경계 시각 확인 필요': ['Boundary time requires verification', '需核实临界时间'],
  '확인 불가': ['Cannot verify', '无法确认'],
  '계산 정보 없음': ['Calculation unavailable', '无计算数据'],
  '계산 완료': ['Calculated', '已计算'],
  '확정': ['Confirmed', '已确认'],
  '오행 미확인': ['Element unknown', '五行未确认'],
  '음양 미확인': ['Yin/Yang unknown', '阴阳未确认'],
  '일주가 확정될 때 표시됩니다.': ['Shown when the day pillar is confirmed.', '确认日柱后显示。'],
  '네 기둥 계산 완료': ['All four pillars calculated', '四柱计算完成'],
  '출생시간을 모르는 입력으로 계산되어 시주 등 일부 사실이 제한될 수 있습니다.': ['The birth time is unknown; some facts including the hour pillar may be unavailable.', '出生时间不详，时柱等部分信息可能无法确定。'],
  '현재 Birth Profile revision에 결속된 계산 결과입니다.': ['Calculated from the current birth profile revision.', '根据当前出生资料版本计算的结果。'],
  '시간 모름': ['Unknown time', '时间不详'],
  '음력': ['Lunar', '农历'],
  '양력': ['Solar', '公历'],
  '현재 자기 Birth Profile과 연결된 계산 결과입니다.': ['Calculated from your current birth profile.', '根据您当前出生资料计算的结果。'],
  '올해의 흐름': ['This year', '今年走势'],
});
const STATUS_COPY = Object.freeze({
  '복수 후보': ['複数候補', '多個候選'],
  '경계 시각 확인 필요': ['境界時刻の確認が必要', '需要確認臨界時間'],
  '확인 불가': ['確認不可', '無法確認'],
  '계산 정보 없음': ['計算情報なし', '沒有計算資訊'],
  '계산 완료': ['計算完了', '計算完成'],
  '확정': ['確定', '已確認'],
  '오행 미확인': ['五行未確認', '五行未確認'],
  '음양 미확인': ['陰陽未確認', '陰陽未確認'],
  '일주가 확정될 때 표시됩니다.': ['日柱が確定すると表示されます。', '日柱確認後將顯示。'],
  '네 기둥 계산 완료': ['四柱の計算が完了しました', '四柱計算完成'],
  '출생시간을 모르는 입력으로 계산되어 시주 등 일부 사실이 제한될 수 있습니다.': [
    '出生時刻が不明のため、時柱など一部の結果には制限があります。',
    '由於出生時間不詳，時柱等部分結果可能受到限制。',
  ],
  '현재 Birth Profile revision에 결속된 계산 결과입니다.': [
    '現在の出生情報の改訂版に紐づく計算結果です。',
    '這是與目前出生資料版本關聯的計算結果。',
  ],
  '시간 모름': ['時刻不明', '時間不詳'],
  '음력': ['旧暦', '農曆'],
  '양력': ['新暦', '國曆'],
  '현재 자기 Birth Profile과 연결된 계산 결과입니다.': [
    '現在の出生情報に紐づく計算結果です。',
    '這是與目前出生資料關聯的計算結果。',
  ],
  '올해의 흐름': ['今年の流れ', '今年的運勢走向'],
});
export function sajuDisplayLocaleV1(locale) {
  return SAJU_DISPLAY_LOCALES_V1.includes(locale) ? locale : 'ko-KR';
}
export function localizeSajuCopyV1(korean, locale = 'ko-KR') {
  const language = sajuDisplayLocaleV1(locale);
  if (language === 'ko-KR') return korean;
  if (language === 'en-US' || language === 'zh-CN') {
    return STATUS_EN_CN[korean]?.[language === 'en-US' ? 0 : 1] ?? korean;
  }
  return STATUS_COPY[korean]?.[language === 'ja-JP' ? 0 : 1] ?? korean;
}
export function sajuPillarLabelV1(key, locale = 'ko-KR') {
  const row = Object.hasOwn(PILLARS, key) ? PILLARS[key] : null;
  if (!row) return null;
  const language = sajuDisplayLocaleV1(locale);
  if (language === 'en-US' || language === 'zh-CN') return PILLAR_EN_CN[key][language === 'en-US' ? 0 : 1];
  return row[language === 'ko-KR' ? 0 : language === 'ja-JP' ? 1 : 2];
}
export function sajuElementLabelV1(element, locale = 'ko-KR') {
  const language = sajuDisplayLocaleV1(locale);
  if (language === 'ko-KR') return element;
  if (language === 'en-US') return Object.hasOwn(ELEMENTS_EN, element) ? ELEMENTS_EN[element] : element;
  return Object.hasOwn(ELEMENTS, element) ? ELEMENTS[element] : element;
}
export function sajuYinYangLabelV1(value, locale = 'ko-KR') {
  const language = sajuDisplayLocaleV1(locale);
  if (language === 'ko-KR') return value;
  const words = language === 'en-US' ? YINYANG_EN : language === 'zh-CN' ? YINYANG_CN : YINYANG;
  return Object.hasOwn(words, value) ? words[value] : value;
}
export function projectSajuPillarDisplayV1(state, locale = 'ko-KR') {
  const resolved = state && typeof state === 'object' && state.status === 'resolved'
    && state.value && typeof state.value === 'object' ? state.value : null;
  if (resolved) {
    const stem = resolved.stem;
    const branch = resolved.branch;
    const hanja = `${stem?.hanja || ''}${branch?.hanja || ''}`;
    const korean = `${stem?.value || ''}${branch?.value || ''}`;
    const elementKeys = [stem?.element, branch?.element].filter(Boolean);
    return Object.freeze({
      characters: `${stem?.hanja || stem?.value || ''}${branch?.hanja || branch?.value || ''}` || '—',
      text: sajuDisplayLocaleV1(locale) === 'ko-KR'
        ? korean || '확정'
        : hanja || localizeSajuCopyV1('확정',locale),
      meta: elementKeys.map(value => sajuElementLabelV1(value,locale)).join(' · ')
        || localizeSajuCopyV1('계산 완료',locale),
    });
  }
  if (state?.status === 'ambiguous') {
    return Object.freeze({
      characters:'◇', text:localizeSajuCopyV1('복수 후보',locale),
      meta:localizeSajuCopyV1('경계 시각 확인 필요',locale),
    });
  }
  return Object.freeze({
    characters:'—', text:localizeSajuCopyV1('확인 불가',locale),
    meta:state?.reasonCode || localizeSajuCopyV1('계산 정보 없음',locale),
  });
}
export function sajuCompletenessLabelV1(count, complete, locale = 'ko-KR') {
  const language = sajuDisplayLocaleV1(locale);
  if (complete) return localizeSajuCopyV1('네 기둥 계산 완료',language);
  if (language === 'ja-JP') return `四柱のうち${count}柱が確定`;
  if (language === 'zh-TW') return `已確認四柱中的${count}柱`;
  if (language === 'en-US') return `${count}/4 pillars confirmed`;
  if (language === 'zh-CN') return `已确认 ${count}/4 柱`;
  return `${count}/4 기둥 확정`;
}
export function sajuCurrentYearLabelV1(year, locale = 'ko-KR') {
  const language = sajuDisplayLocaleV1(locale);
  if (language === 'ja-JP') return `${year}年 · 今年の流れ`;
  if (language === 'zh-TW') return `${year}年 · 今年的運勢走向`;
  if (language === 'en-US') return `${year} · This year`;
  if (language === 'zh-CN') return `${year}年 · 今年走势`;
  return `${year}년 · 올해의 흐름`;
}
