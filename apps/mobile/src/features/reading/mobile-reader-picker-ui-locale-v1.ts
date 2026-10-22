import { normalizeMobileUiLocale } from '../../ui/mobile-ui-copy.js';

/**
 * Native Saju/Face Reader chooser: authored UI labels only.
 * Reader IDs, descriptions, portraits, eligible preview, reading source,
 * product/grant admission and response voice are deliberately outside scope.
 */
const COPY = Object.freeze({
  'ko-KR': Object.freeze({
    kicker: 'READER · 세연 프리뷰 장면',
    portrait: '대리자 초상화',
    select: 'Reader 선택',
    close: '닫기',
    change: '변경',
    previewOnly: '프리뷰만',
    conceptPending: '컨셉 준비 중',
    selectionLimit: '현재 세연만 프리뷰 장면을 선택할 수 있으며, 유료 Reader 해석은 아직 공개되지 않았습니다.',
    authorityBoundary: 'Reader 표시와 프리뷰 선택은 상품 지원, 구매 접근권, 공개 승인 또는 공식 Reading 열람 권한을 뜻하지 않습니다. 이 권한들은 서버가 각각 확인해야 합니다.',
    saju: '선택한 Reader는 현재 사주 프리뷰 화면의 표시만 바꿉니다. 해석 근거와 내용은 변경되지 않습니다.',
    face: '선택한 Reader는 현재 관상 준비 화면의 표시만 바꿉니다. 사진 분석과 Reader 풀이는 아직 열리지 않았습니다.',
    sourceNotice: '',
  }),
  'ja-JP': Object.freeze({
    kicker: '案内人 · セヨンのプレビュー',
    portrait: '案内人の肖像',
    select: '案内人を選択',
    close: '閉じる',
    change: '変更',
    previewOnly: 'プレビューのみ',
    conceptPending: 'コンセプト準備中',
    selectionLimit: '現在、プレビュー場面を選べるのはセヨンだけです。有料の案内人解説はまだ公開されていません。',
    authorityBoundary: '案内人の表示やプレビュー選択は、商品対応・購入権限・公開承認・公式鑑定へのアクセスを意味しません。それぞれサーバーによる確認が必要です。',
    saju: '案内人の選択は、現在の四柱推命プレビューの表示のみを変更します。鑑定の根拠や本文は変更しません。',
    face: '案内人の選択は、現在の顔相準備画面の表示のみを変更します。写真分析と案内人の鑑定はまだ利用できません。',
    sourceNotice: '人物ごとの紹介文は原文のまま表示され、画面言語の変更では翻訳されません。',
  }),
  'zh-TW': Object.freeze({
    kicker: '引路人 · 世妍預覽',
    portrait: '引路人肖像',
    select: '選擇引路人',
    close: '關閉',
    change: '更換',
    previewOnly: '僅限預覽',
    conceptPending: '角色設定準備中',
    selectionLimit: '目前只有世妍可以選擇預覽場景，付費引路人解說尚未公開。',
    authorityBoundary: '顯示引路人或選擇預覽並不代表商品支援、購買權限、公開核准或正式解讀閱覽權，以上皆須由伺服器分別確認。',
    saju: '選擇引路人只會變更目前八字預覽畫面的呈現方式，不會更動解讀依據或正文。',
    face: '選擇引路人只會變更目前面相準備畫面的呈現方式，照片分析與引路人解說尚未開放。',
    sourceNotice: '人物介紹文字會保留原文，切換介面語言不會翻譯。',
  }),
} as const);

export function projectMobileReaderPickerUiV1(requestedLocale: unknown) {
  const uiLocale = normalizeMobileUiLocale(requestedLocale);
  return Object.freeze({
    uiLocale,
    ...COPY[uiLocale],
    readerOutputLocalized: false as const,
    interpretationReleased: false as const,
  });
}
