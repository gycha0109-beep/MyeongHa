import { normalizeUiLocale, translateStaticUi } from './ui-i18n.js';

// Authored Reading-scene UI only. Never localize source-owned Reading blocks.
const SCENE_COPY = Object.freeze({
  'ko-KR': Object.freeze({
    scope: { original: '원국', month: '이번 달' },
    year: (year) => `${year}년 · 올해`,
    progress: (index, total) => `읽기 ${index} / ${total}`,
    structure: '이 해석의 사주 근거',
    supporting: '함께 볼 포인트',
    basis: '이 해석을 읽는 기준',
    next: '다음 읽기',
    finish: '읽기 마치기',
    recordNote: '기록 · 당시 저장된 공식 사주 풀이를 그대로 다시 읽고 있습니다.',
    previewNote: 'Preview · 현재 주제의 검증용 읽기이며 공식 기록에 저장되지 않습니다.',
    recordLink: '기록에서 사주 보기',
    otherLink: '다른 사주 읽기',
    blockedTitle: (topic) => `${topic} 읽기는 아직 준비 중입니다.`,
    loadingTitle: (topic) => `${topic} 프리뷰를 준비하고 있습니다.`,
    loadingCopy: '현재 Birth Profile과 검증된 Saju Preview Reading을 연결하고 있습니다.',
    blockedInput: {
      family_scope: '가족 읽기는 부모운 또는 자녀운을 먼저 선택해야 합니다.',
      target_person: '궁합은 상대의 명식 참조가 먼저 필요합니다.',
      question: '고민 읽기는 실제 질문을 먼저 입력해야 합니다.',
    },
    inputFallback: '추가 입력이 필요합니다.',
    inputSuffix: ' 현재 Preview 실행 범위에 포함되지 않은 요청은 전송하지 않습니다.',
    readyCopy: (version) => `이 버튼은 Saju Engine의 ${version} 요청 문법까지 정확히 매핑되어 있습니다. 다만 현재 가승인된 Preview 범위에는 포함되지 않아 실제 해석 요청은 전송하지 않습니다. 다른 주제의 풀이로 대신 보여드리지 않습니다.`,
    unavailableCopy: '현재 제공 가능한 검증된 사주 읽기 범위가 열리지 않아 이 결과를 실행하지 않습니다. 다른 주제의 풀이로 대신 보여드리지 않습니다.',
    blockedDocument: '사주 해석',
    loadingDocument: '사주 프리뷰',
  }),
  'ja-JP': Object.freeze({
    scope: { original: '命式', month: '今月' },
    year: (year) => `${year}年 · 今年`,
    progress: (index, total) => `鑑定 ${index} / ${total}`,
    structure: 'この解釈の命式上の根拠',
    supporting: 'あわせて確認する点',
    basis: 'この解釈を読む際の基準',
    next: '次の項目',
    finish: '鑑定を終了',
    recordNote: '記録 · 保存当時の公式鑑定を変更せずに表示しています。',
    previewNote: 'Preview · 検証用の鑑定であり、公式記録には保存されません。',
    recordLink: '記録で鑑定を見る',
    otherLink: '別の鑑定を見る',
    blockedTitle: (topic) => `${topic}の鑑定はまだ準備中です。`,
    loadingTitle: (topic) => `${topic}のプレビューを準備しています。`,
    loadingCopy: '現在の出生プロフィールと検証済みの四柱推命プレビューを接続しています。',
    blockedInput: {
      family_scope: '家族の鑑定では、まず両親または子どもの対象を選択してください。',
      target_person: '相性鑑定には相手の命式参照が必要です。',
      question: '相談内容の鑑定には、まず具体的な質問を入力してください。',
    },
    inputFallback: '追加の入力が必要です。',
    inputSuffix: ' 現在のプレビュー実行範囲に含まれない要求は送信しません。',
    readyCopy: (version) => `このボタンはSaju Engineの${version}リクエスト仕様に対応しています。ただし、現在承認されたプレビューの対象外のため、実際の鑑定要求は送信しません。別の鑑定に置き換えることもありません。`,
    unavailableCopy: '現在利用可能な検証済みの鑑定範囲に含まれないため、この要求は実行しません。別の鑑定に置き換えることもありません。',
    blockedDocument: '四柱推命の鑑定',
    loadingDocument: '四柱推命プレビュー',
  }),
  'zh-TW': Object.freeze({
    scope: { original: '本命', month: '本月' },
    year: (year) => `${year}年 · 今年`,
    progress: (index, total) => `解讀 ${index} / ${total}`,
    structure: '本次解讀的八字依據',
    supporting: '值得一併確認的重點',
    basis: '閱讀本次解讀的依據',
    next: '下一段解讀',
    finish: '完成解讀',
    recordNote: '紀錄 · 正在原樣顯示當時儲存的正式八字解讀。',
    previewNote: 'Preview · 目前為已驗證範圍內的預覽解讀，不會儲存至正式紀錄。',
    recordLink: '從紀錄查看八字解讀',
    otherLink: '查看其他八字解讀',
    blockedTitle: (topic) => `${topic}的解讀尚在準備中。`,
    loadingTitle: (topic) => `正在準備${topic}的預覽。`,
    loadingCopy: '正在連結目前的出生資料與已驗證的八字預覽解讀。',
    blockedInput: {
      family_scope: '家庭解讀需要先選擇父母或子女的範圍。',
      target_person: '合盤解讀需要先提供對方的命盤參照。',
      question: '針對疑問的解讀需要先輸入具體問題。',
    },
    inputFallback: '需要補充輸入資訊。',
    inputSuffix: ' 不會送出目前預覽執行範圍以外的請求。',
    readyCopy: (version) => `此按鈕已對應至Saju Engine的${version}請求格式，但尚不屬於目前獲准的預覽範圍，因此不會送出實際解讀請求，也不會以其他主題取代。`,
    unavailableCopy: '目前尚未開放可提供的已驗證八字解讀範圍，因此不執行此請求，也不會以其他主題取代。',
    blockedDocument: '八字解讀',
    loadingDocument: '八字預覽',
  }),
  'en-US': Object.freeze({
    scope: { original: 'Natal chart', month: 'This month' },
    year: (year) => `${year} · This year`,
    progress: (index, total) => `Reading ${index} / ${total}`,
    structure: 'Saju evidence for this interpretation',
    supporting: 'Other points to consider',
    basis: 'How to read this interpretation',
    next: 'Next section',
    finish: 'Finish reading',
    recordNote: 'Records · Viewing the official Saju reading exactly as it was saved.',
    previewNote: 'Preview · This is a verified preview and is not saved as an official record.',
    recordLink: 'View Saju in Records',
    otherLink: 'Explore other Saju readings',
    blockedTitle: (topic) => `${topic} reading is not available yet.`,
    loadingTitle: (topic) => `Preparing a ${topic} preview.`,
    loadingCopy: 'Connecting your current Birth Profile with the verified Saju Preview Reading.',
    blockedInput: {
      family_scope: 'Choose parents or children first for a family reading.',
      target_person: 'A compatibility reading requires the other person’s chart reference.',
      question: 'Enter a specific question before requesting a question-based reading.',
    },
    inputFallback: 'Additional input is required.',
    inputSuffix: ' Requests outside the currently available preview scope will not be sent.',
    readyCopy: (version) => `This button maps to Saju Engine request format ${version}. However, this topic is outside the currently approved preview scope, so no reading request will be sent. We will not substitute another topic.`,
    unavailableCopy: 'A verified reading is not currently available for this topic. No request will be sent, and another topic will not be substituted.',
    blockedDocument: 'Saju reading',
    loadingDocument: 'Saju preview',
  }),
  'zh-CN': Object.freeze({
    scope: { original: '原局', month: '本月' },
    year: (year) => `${year}年 · 今年`,
    progress: (index, total) => `解读 ${index} / ${total}`,
    structure: '本次解读的八字依据',
    supporting: '其他值得关注的要点',
    basis: '阅读本次解读的依据',
    next: '下一段解读',
    finish: '结束解读',
    recordNote: '记录 · 正在原样查看当时保存的正式八字解读。',
    previewNote: '预览 · 当前为已验证的预览内容，不会保存为正式记录。',
    recordLink: '从记录查看八字',
    otherLink: '查看其他八字解读',
    blockedTitle: (topic) => `${topic}解读尚未开放。`,
    loadingTitle: (topic) => `正在准备${topic}预览。`,
    loadingCopy: '正在连接当前出生资料与已验证的八字预览解读。',
    blockedInput: {
      family_scope: '家庭解读需要先选择父母或子女。',
      target_person: '合盘解读需要先提供对方的命盘引用。',
      question: '针对具体问题的解读需要先输入问题。',
    },
    inputFallback: '需要补充输入信息。',
    inputSuffix: ' 不会发送当前预览范围以外的请求。',
    readyCopy: (version) => `此按钮已对应 Saju Engine 的 ${version} 请求格式，但该主题尚未纳入已批准的预览范围，因此不会发送解读请求，也不会用其他主题替代。`,
    unavailableCopy: '该主题目前没有可用的已验证解读，因此不会执行请求，也不会用其他主题替代。',
    blockedDocument: '八字解读',
    loadingDocument: '八字预览',
  }),
});

function sceneCopy(locale) {
  return SCENE_COPY[normalizeUiLocale(locale)] ?? SCENE_COPY['ko-KR'];
}

export function readingScopeLabelV1(scope, year, locale = 'ko-KR') {
  const copy = sceneCopy(locale);
  return scope === 'year' ? copy.year(year) : copy.scope[scope] ?? copy.scope.original;
}

export function readingSceneProgressV1(index, total, flags, isStoredRecord, locale = 'ko-KR') {
  const copy = sceneCopy(locale);
  return {
    progress: copy.progress(index + 1, total),
    structureTitle: flags.hasStructure ? copy.structure : flags.hasSupporting ? copy.supporting : copy.basis,
    supportingTitle: copy.supporting,
    nextLabel: index >= total - 1 ? copy.finish : copy.next,
    authorityNote: isStoredRecord ? copy.recordNote : copy.previewNote,
    recordsLinkLabel: isStoredRecord ? copy.recordLink : copy.otherLink,
  };
}

export function readingRouteStateCopyV1(route, engineRequest, mode, year, locale = 'ko-KR') {
  const copy = sceneCopy(locale);
  const topic = translateStaticUi(route.label, locale);
  const scope = readingScopeLabelV1(route.scope, year, locale);
  const productTitle = route.topic === 'general' ? scope : `${topic} · ${scope}`;
  const blocked = mode === 'blocked';
  let stateCopy = copy.loadingCopy;
  if (blocked) {
    if (engineRequest?.state === 'requires_input') {
      stateCopy = (copy.blockedInput[engineRequest.input] ?? copy.inputFallback) + copy.inputSuffix;
    } else if (engineRequest?.state === 'ready') {
      stateCopy = copy.readyCopy(engineRequest.adapterVersion);
    } else {
      stateCopy = copy.unavailableCopy;
    }
  }
  return {
    scope,
    productTitle,
    stateTitle: blocked ? copy.blockedTitle(topic) : copy.loadingTitle(topic),
    stateCopy,
    documentTitle: `${topic} · ${blocked ? copy.blockedDocument : copy.loadingDocument} · 명하`,
  };
}
