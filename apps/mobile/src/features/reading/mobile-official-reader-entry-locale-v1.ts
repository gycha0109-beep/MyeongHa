import { normalizeMobileUiLocale } from '../../ui/mobile-ui-copy.js';
import type { MobileOfficialReadingReaderEntryStatusV1 } from './mobile-official-reading-reader-entry-view-model.js';

/**
 * I18N-07: authored Reader introduction and blocked-admission UI only.
 * Neither a translated Character Bible nor a grant/Thread/Reading locale.
 * Reader name, title and voice-introduction source fields remain untouched.
 */
const COPY = Object.freeze({
  'ko-KR': Object.freeze({
    eyebrow: 'READER · 준비 중',
    title: '이 공식 사주를 읽어줄 인물',
    description: '공식 Reading 기반의 Reader 소개입니다. 해설 실행 및 후속 대화는 제공되지 않습니다.',
    viewIntroduction: '소개 보기',
    viewIntroductionHint: '인물 소개만 변경하며 유료 해설은 실행하지 않습니다.',
    preview: '프리뷰 소개',
    conceptPending: '컨셉 준비 중',
    selectionBoundary: '현재 선택은 인물 소개를 보기 위한 것입니다. 이 Reader의 구매 접근권, 공식 Reading 열람 또는 전용 Thread가 생성되지 않습니다.',
    statusTitle: '해설 진입 상태',
    sourceNotice: '',
    disabledLabel: '해설 서비스 준비 중',
    disabledAccessibilityLabel: 'Reader 해설 진입 비활성',
    authorityBoundary: 'Reader 소개 및 기록 연결은 상품 적격성, 구매 접근권, 공개 승인, 공식 Reading 접근 허가의 증명이 아닙니다.',
    statusMessages: Object.freeze({
      public_route_off: '공식 Reader 해설은 아직 공개되지 않았습니다.',
      server_verification_required: '상품·구매·공개 승인·공식 Reading 접근을 서버에서 확인해야 합니다.',
      product_unsupported: '이 상품은 해당 Reader 해설 대상이 아닙니다.',
      purchase_access_required: '해설 구매 접근권이 확인되지 않았습니다.',
      release_approval_pending: '해당 Reader 해설의 공개 승인을 기다리고 있습니다.',
      release_temporarily_unavailable: '해당 Reader 해설은 현재 이용할 수 없습니다.',
      official_reading_access_denied: '이 공식 Reading에 대한 해설 접근이 허용되지 않았습니다.',
      retryable_verification_failure: '서버 확인 중 일시적인 문제가 발생했습니다. 해설 진입은 차단됩니다.',
      protected_verification_failure: '권한 또는 응답을 안전하게 확인할 수 없어 해설 진입을 차단했습니다.',
      server_admission_required: '개별 확인 후에도 실제 해설 진입에는 별도 서버 승인이 필요합니다.',
    }),
  }),
  'ja-JP': Object.freeze({
    eyebrow: '案内人 · 準備中',
    title: 'この公式鑑定を案内する人物',
    description: '公式鑑定に関する案内人の紹介です。解説の実行や後続の会話は提供していません。',
    viewIntroduction: '紹介を見る',
    viewIntroductionHint: '人物の紹介表示のみを変更します。有料の解説は実行しません。',
    preview: 'プレビュー紹介',
    conceptPending: 'コンセプト準備中',
    selectionBoundary: 'この選択は人物の紹介を見るためのものです。購入権限、公式鑑定の閲覧権限、専用スレッドは作成されません。',
    statusTitle: '解説へのアクセス状態',
    sourceNotice: '人物ごとの紹介文は原文のまま表示され、画面言語の変更では翻訳されません。',
    disabledLabel: '解説サービス準備中',
    disabledAccessibilityLabel: '案内人の解説へのアクセスは無効です',
    authorityBoundary: '人物の紹介や記録との関連づけは、商品適格性・購入権限・公開承認・公式鑑定の閲覧許可を意味しません。',
    statusMessages: Object.freeze({
      public_route_off: '公式の案内人解説はまだ公開されていません。',
      server_verification_required: '商品・購入・公開承認・公式鑑定へのアクセスをサーバーで確認する必要があります。',
      product_unsupported: 'この商品は該当する案内人の解説に対応していません。',
      purchase_access_required: '解説の購入権限が確認されていません。',
      release_approval_pending: 'この案内人の解説は公開承認待ちです。',
      release_temporarily_unavailable: 'この案内人の解説は現在利用できません。',
      official_reading_access_denied: 'この公式鑑定の解説にはアクセスできません。',
      retryable_verification_failure: 'サーバー確認中に一時的な問題が発生しました。解説へのアクセスは遮断されています。',
      protected_verification_failure: '権限や応答を安全に確認できないため、解説へのアクセスを遮断しました。',
      server_admission_required: '個別の確認後も、実際の解説にはサーバーの別途承認が必要です。',
    }),
  }),
  'zh-TW': Object.freeze({
    eyebrow: '引路人 · 準備中',
    title: '為這份正式八字解讀提供說明的人物',
    description: '這是與正式解讀相關的引路人介紹，目前不提供解說服務或後續對話。',
    viewIntroduction: '查看介紹',
    viewIntroductionHint: '只切換人物介紹，不會執行付費解說。',
    preview: '預覽介紹',
    conceptPending: '角色設定準備中',
    selectionBoundary: '此選擇僅供查看人物介紹，不會產生購買權限、正式解讀閱覽權或專屬對話串。',
    statusTitle: '解說存取狀態',
    sourceNotice: '人物介紹文字會保留原文，切換介面語言不會翻譯。',
    disabledLabel: '解說服務準備中',
    disabledAccessibilityLabel: '引路人解說入口未開放',
    authorityBoundary: '人物介紹及紀錄關聯不代表商品資格、購買權限、公開核准或正式解讀的閱覽許可。',
    statusMessages: Object.freeze({
      public_route_off: '正式引路人解說尚未公開。',
      server_verification_required: '商品、購買權限、公開核准及正式解讀的存取權須由伺服器確認。',
      product_unsupported: '此商品不支援這位引路人的解說。',
      purchase_access_required: '尚未確認解說的購買權限。',
      release_approval_pending: '這位引路人的解說仍待公開核准。',
      release_temporarily_unavailable: '目前無法使用這位引路人的解說。',
      official_reading_access_denied: '目前不允許存取這份正式解讀的引路人解說。',
      retryable_verification_failure: '伺服器確認時發生暫時性問題，解說入口仍維持封鎖。',
      protected_verification_failure: '無法安全確認權限或回應，因此已封鎖解說入口。',
      server_admission_required: '即使個別條件已確認，實際進入解說仍須經伺服器另行核准。',
    }),
  }),
} as const);

export function projectMobileOfficialReaderEntryUiV1(
  requestedLocale: unknown,
  status: MobileOfficialReadingReaderEntryStatusV1,
) {
  const uiLocale = normalizeMobileUiLocale(requestedLocale);
  const authored = COPY[uiLocale];
  // An unexpected status never implies admission, a translation or release.
  const statusMessage: string = Object.prototype.hasOwnProperty.call(authored.statusMessages, status)
    ? authored.statusMessages[status]
    : authored.statusMessages.protected_verification_failure;
  return Object.freeze({
    uiLocale,
    eyebrow: authored.eyebrow,
    title: authored.title,
    description: authored.description,
    viewIntroduction: authored.viewIntroduction,
    viewIntroductionHint: authored.viewIntroductionHint,
    preview: authored.preview,
    conceptPending: authored.conceptPending,
    selectionBoundary: authored.selectionBoundary,
    statusTitle: authored.statusTitle,
    sourceNotice: authored.sourceNotice,
    statusMessage,
    disabledLabel: authored.disabledLabel,
    disabledAccessibilityLabel: authored.disabledAccessibilityLabel,
    authorityBoundary: authored.authorityBoundary,
    readerOutputLocalized: false as const,
    interpretationReleased: false as const,
  });
}
