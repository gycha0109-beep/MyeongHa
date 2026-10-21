// Static reading-experience UI only. Never localize a Saju server section,
// Claim, disclosure, user input, or an Official Reading stored body here.
const COPY = new Map([
  ['이 해석의 사주 근거', 'この解釈の四柱推命上の根拠', '本段解讀的八字依據'],
  ['함께 볼 포인트', 'あわせて見るポイント', '一併參考的重點'],
  ['이 해석을 읽는 기준', 'この解釈の読み方', '本段解讀的依據'],
  ['원국에서 확인된 해석 축을 바탕으로 읽는 항목입니다.', '命式原局で確認された解釈の観点に基づく項目です。', '本項目依據原局已確認的解讀面向呈現。'],
  ['좋고 나쁨으로 단정하기보다 실제 생활에서 이 흐름이 반복되는지 확인해 보세요.', '吉凶を決めつけず、実生活でこの傾向が繰り返されるか確認してみてください。', '與其直接判定吉凶，不如觀察這種走勢是否在實際生活中反覆出現。'],
  ['기록 · 당시 저장된 공식 사주 풀이를 그대로 다시 읽고 있습니다.', '記録 · 当時保存された公式鑑定をそのまま再表示しています。', '紀錄 · 正在原樣重新顯示當時儲存的正式八字解讀。'],
  ['Preview · 현재 주제의 검증용 읽기이며 공식 기록에 저장되지 않습니다.', 'プレビュー · この内容は検証用であり、公式記録には保存されません。', '預覽 · 本內容僅供驗證，不會儲存至正式紀錄。'],
  ['읽기 마치기', '鑑定を終える', '結束解讀'],
  ['다음 읽기', '次の鑑定へ', '下一段解讀'],
  ['기록에서 사주 보기', '記録から鑑定を見る', '從紀錄查看八字'],
  ['다른 사주 읽기', 'ほかの鑑定', '其他八字解讀'],
  ['이 프리뷰는 공식 풀이 기록에 저장되지 않습니다. 다른 사주 읽기는 사주 페이지에서 선택할 수 있습니다.', 'このプレビューは公式鑑定の記録には保存されません。別の鑑定は四柱推命ページから選択できます。', '本預覽不會儲存至正式解讀紀錄。您可以在八字頁面選擇其他解讀。'],
  ['저장된 공식 사주 풀이를 끝까지 확인했습니다.', '保存された公式鑑定を最後まで確認しました。', '您已完整查看儲存的正式八字解讀。'],
  ['이 결과는 기록에 저장된 Official Reading입니다. 대화를 시작하려면 대화 상대를 새로 선택해 주세요.', 'この結果は記録に保存された公式鑑定です。会話を始めるには、相手を新たに選択してください。', '這是紀錄中儲存的正式解讀。如要開始對話，請重新選擇對話對象。'],
]);
export function readingUiCopyV1(source, locale = 'ko-KR') {
  if (locale !== 'ja-JP' && locale !== 'zh-TW') return source;
  const row = COPY.get(source);
  return row?.[locale === 'ja-JP' ? 1 : 2] ?? source;
}
export function readingUiProgressV1(index, total, locale = 'ko-KR') {
  const label = locale === 'ja-JP' ? '鑑定' : locale === 'zh-TW' ? '解讀' : '읽기';
  return `${label} ${index + 1} / ${total}`;
}
export function readingUiReaderLineV1(sourceTitle, locale = 'ko-KR') {
  // The source-owned title is inserted unchanged: localization does not
  // manufacture an alternate meaning for official section titles.
  if (locale === 'ja-JP') return `「${sourceTitle}」の項目を確認します。`;
  if (locale === 'zh-TW') return `正在查看「${sourceTitle}」項目。`;
  return `${sourceTitle} 항목을 확인합니다.`;
}
