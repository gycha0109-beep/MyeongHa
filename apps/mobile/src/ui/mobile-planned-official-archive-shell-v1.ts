/**
 * I18N-07 EN-UI-B/CN-UI-B: staged, authored Official Reading archive UI.
 * NOT active in current mobile UI normalization or server locale admission.
 * Saved official reading blocks, source IDs, provenance, grant/Reader admission
 * and text are outside this file. Source readings are NEVER retranslated.
 */
export const PLANNED_ARCHIVE_LOCALES_V1 = ['en-US', 'zh-CN'] as const;
type PlannedArchiveLocaleV1 = typeof PLANNED_ARCHIVE_LOCALES_V1[number];
const COPY = Object.freeze({
  'en-US': Object.freeze({
  "back": "← Back to records",
  "loading": "Loading saved official reading…",
  "retry": "Try again",
  "original": "Records · Showing the official Saju reading exactly as it was saved.",
  "readerHeading": "This official reading and its guides",
  "noReader": "No guide information is linked to this official record.",
  "readerBoundary": "A linked guide is not proof of a commentary purchase, permission to view commentary, or completed commentary. Viewing a guide's commentary again or continuing the conversation requires separate approved server access and record contracts.",
  "noticesTitle": "About the scope of this reading",
  "stepPrefix": "Reading",
  "structureTitle": "Saju grounds for this interpretation",
  "supportingTitle": "Points to consider"
}),
  'zh-CN': Object.freeze({
  "back": "← 返回记录",
  "loading": "正在加载已保存的正式解读…",
  "retry": "重试",
  "original": "记录 · 正在原样显示当时保存的正式八字解读。",
  "readerHeading": "本次正式解读与引路人",
  "noReader": "此正式记录没有关联的引路人信息。",
  "readerBoundary": "关联引路人不代表已购买解说、拥有解说查看权限或解说已完成。再次查看引路人解说或进行后续对话，须待服务器分别批准访问权限和记录规则。",
  "noticesTitle": "解读范围说明",
  "stepPrefix": "解读",
  "structureTitle": "本次解读的八字依据",
  "supportingTitle": "值得关注的要点"
}),
} as const);
const FAILURE_COPY = Object.freeze({
  "로그인 상태가 변경되어 이전 계정의 공식 풀이를 표시하지 않았습니다.": [
    "The account changed, so the previous account's official reading is not displayed.",
    "登录状态已变更，因此不会显示此前账号的正式解读。"
  ],
  "현재 기록에서 이 저장된 풀이를 찾을 수 없습니다.": [
    "This saved reading could not be found in the current records.",
    "无法在当前记录中找到这份已保存的解读。"
  ],
  "저장된 공식 풀이를 안전하게 표시할 수 없습니다.": [
    "The saved official reading cannot be displayed safely.",
    "无法安全显示已保存的正式解读。"
  ],
  "저장된 풀이를 불러오지 못했습니다.": [
    "Could not load the saved reading.",
    "无法加载已保存的解读。"
  ]
} as const);
const GENERIC_FAILURE = '저장된 풀이를 불러오지 못했습니다.' as const;

/** Exact known error categories only; unexpected content remains a safe generic UI failure. */
export function projectPlannedArchiveFailureV1(message: unknown, requestedLocale: unknown): string | null {
  if (requestedLocale !== 'en-US' && requestedLocale !== 'zh-CN') return null;
  const locale = requestedLocale;
  const key = typeof message === 'string' && Object.prototype.hasOwnProperty.call(FAILURE_COPY, message)
    ? message as keyof typeof FAILURE_COPY
    : GENERIC_FAILURE;
  return FAILURE_COPY[key][locale === 'en-US' ? 0 : 1];
}

/** Read-only preview text. A locale parameter never opens an Official Reading. */
export function projectPlannedOfficialArchiveUiV1(requestedLocale: unknown) {
  if (requestedLocale !== 'en-US' && requestedLocale !== 'zh-CN') return null;
  const uiLocale: PlannedArchiveLocaleV1 = requestedLocale;
  return Object.freeze({
    uiLocale,
    ...COPY[uiLocale],
    readerCount: (count: number) => uiLocale === 'en-US'
      ? `Guides linked to this official record: ${count}`
      : `与此正式记录关联的引路人信息：${count}位`,
    readerLabel: (count: number) => uiLocale === 'en-US'
      ? count === 0 ? 'No guide record' : count === 1 ? 'Reading with a guide' : `Reading with ${count} guides`
      : count === 0 ? '无引路人记录' : count === 1 ? '与引路人一同查看的解读' : `与${count}位引路人一同查看的解读`,
    activeUiLocaleAdmitted: false as const,
    storedReadingTranslated: false as const,
    archivedSourceMutated: false as const,
    readerAccessGranted: false as const,
    readingReissued: false as const,
  });
}
