import { normalizeMobileUiLocale, type MobileUiLocale } from './mobile-ui-copy.js';

/**
 * I18N-07 admitted subset: authored mobile archive shell text ONLY.
 *
 * Saved Official Reading blocks (title, primary, structure, supporting and
 * notices) are owned by the existing Records/Saju source. Their bytes are
 * never passed to this module, including on a UI locale change.
 * Reader linkage is descriptive metadata, NEVER an entitlement/re-entry.
 */
const SHELL = Object.freeze({
  'ko-KR': Object.freeze({
    back: '← 기록으로 돌아가기',
    loading: '저장된 공식 풀이를 불러오는 중입니다…',
    retry: '다시 시도',
    original: '기록 · 당시 저장된 공식 사주 풀이를 그대로 다시 읽고 있습니다.',
    readerHeading: '이 공식 Reading과 Reader',
    readerCount: (count: number) => `공식 기록에 연결된 Reader 정보: ${count}명`,
    noReader: '이 공식 기록에 연결된 Reader 정보가 없습니다.',
    readerLabel: (count: number) => count === 0 ? 'Reader 기록 없음' : count === 1 ? '대리자와 본 풀이' : `대리자 ${count}명과 본 풀이`,
    readerBoundary:
      'Reader 연결 정보는 해설 구매·열람 권한 또는 해설 완료의 증명이 아닙니다. Reader별 해설 다시 보기와 후속 대화는 별도의 서버 권한·기록 계약이 승인된 뒤 제공됩니다.',
    noticesTitle: '읽기 범위 안내',
    stepPrefix: '읽기',
    structureTitle: '이 해석의 사주 근거',
    supportingTitle: '함께 볼 포인트',
  }),
  'ja-JP': Object.freeze({
    back: '← 記録に戻る',
    loading: '保存済みの公式鑑定を読み込んでいます…',
    retry: '再試行',
    original: '記録 · 保存当時の公式鑑定を変更せずに表示しています。',
    readerHeading: 'この公式鑑定と案内人',
    readerCount: (count: number) => `公式記録に関連づけられた案内人情報：${count}人`,
    noReader: 'この公式記録に関連づけられた案内人情報はありません。',
    readerLabel: (count: number) => count === 0 ? '案内人の記録なし' : count === 1 ? '案内人と読んだ鑑定' : `案内人${count}人と読んだ鑑定`,
    readerBoundary:
      '案内人との関連づけは、解説の購入・閲覧権限や解説完了を意味しません。案内人別の解説の再閲覧や後続の会話は、サーバー側の権限・記録に関する契約が承認されてから提供されます。',
    noticesTitle: '鑑定範囲のご案内',
    stepPrefix: '鑑定',
    structureTitle: 'この鑑定の命式根拠',
    supportingTitle: 'あわせて見るポイント',
  }),
  'zh-TW': Object.freeze({
    back: '← 返回紀錄',
    loading: '正在載入已儲存的正式解讀…',
    retry: '重試',
    original: '紀錄 · 正在原樣顯示當時儲存的正式八字解讀。',
    readerHeading: '此正式解讀與引路人',
    readerCount: (count: number) => `正式紀錄關聯的引路人資訊：${count}位`,
    noReader: '此正式紀錄沒有關聯的引路人資訊。',
    readerLabel: (count: number) => count === 0 ? '沒有引路人紀錄' : count === 1 ? '與引路人一同查看的解讀' : `與${count}位引路人一同查看的解讀`,
    readerBoundary:
      '引路人的關聯資訊不代表已購買解說、擁有閱覽權限或解說已完成。再次查看個別引路人的解說及後續對話，須待伺服器權限與紀錄規範另行核准後才會提供。',
    noticesTitle: '解讀範圍說明',
    stepPrefix: '解讀',
    structureTitle: '此解讀的八字依據',
    supportingTitle: '值得一同關注的重點',
  }),
} as const);

const FAILURE_COPY = Object.freeze({
  '로그인 상태가 변경되어 이전 계정의 공식 풀이를 표시하지 않았습니다.': Object.freeze({
    'ko-KR': '로그인 상태가 변경되어 이전 계정의 공식 풀이를 표시하지 않았습니다.',
    'ja-JP': 'ログイン状態が変わったため、以前のアカウントの公式鑑定は表示していません。',
    'zh-TW': '登入狀態已變更，因此不會顯示先前帳號的正式解讀。',
  }),
  '현재 기록에서 이 저장된 풀이를 찾을 수 없습니다.': Object.freeze({
    'ko-KR': '현재 기록에서 이 저장된 풀이를 찾을 수 없습니다.',
    'ja-JP': '現在の記録に、この保存済みの鑑定が見つかりません。',
    'zh-TW': '目前紀錄中找不到這份已儲存的解讀。',
  }),
  '저장된 공식 풀이를 안전하게 표시할 수 없습니다.': Object.freeze({
    'ko-KR': '저장된 공식 풀이를 안전하게 표시할 수 없습니다.',
    'ja-JP': '保存済みの公式鑑定を安全に表示できません。',
    'zh-TW': '無法安全顯示已儲存的正式解讀。',
  }),
  '저장된 풀이를 불러오지 못했습니다.': Object.freeze({
    'ko-KR': '저장된 풀이를 불러오지 못했습니다.',
    'ja-JP': '保存済みの鑑定を読み込めませんでした。',
    'zh-TW': '無法載入已儲存的解讀。',
  }),
} as const);

/** Unknown errors never become invented source readings; display a generic UI failure. */
export function officialReadingArchiveFailureCopyV1(message: unknown, locale: unknown): string {
  const normalized = normalizeMobileUiLocale(locale);
  if (typeof message !== 'string') return FAILURE_COPY['저장된 풀이를 불러오지 못했습니다.'][normalized];
  if (Object.prototype.hasOwnProperty.call(FAILURE_COPY, message)) {
    return FAILURE_COPY[message as keyof typeof FAILURE_COPY][normalized];
  }
  return FAILURE_COPY['저장된 풀이를 불러오지 못했습니다.'][normalized];
}

export function projectMobileOfficialReadingShellV1(locale: unknown): Readonly<{
  uiLocale: MobileUiLocale;
  back: string;
  loading: string;
  retry: string;
  original: string;
  readerHeading: string;
  readerCount: (count: number) => string;
  noReader: string;
  readerLabel: (count: number) => string;
  readerBoundary: string;
  noticesTitle: string;
  stepPrefix: string;
  structureTitle: string;
  supportingTitle: string;
}> {
  const uiLocale = normalizeMobileUiLocale(locale);
  return Object.freeze({ uiLocale, ...SHELL[uiLocale] });
}
