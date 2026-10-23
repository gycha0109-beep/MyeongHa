/**
 * I18N-07 EN-UI-B / CN-UI-B: preview-only Reader picker interface copy.
 * Distinct from the actual three-locale picker and all Character/source/
 * purchasable Reader permissions. Do not import into active pickers until
 * UI language admission and associated full-screen QA are complete.
 */
export const PLANNED_READER_PICKER_LOCALES_V1 = ['en-US', 'zh-CN'] as const;

const COPY = Object.freeze({
  'en-US': Object.freeze({
  "kicker": "GUIDE · Preview scene",
  "portrait": "Guide portrait",
  "select": "Select guide",
  "close": "Close",
  "change": "Change",
  "previewOnly": "Preview only",
  "conceptPending": "Character concept in preparation",
  "selectionLimit": "Only the currently supported character can be selected for a preview scene. Paid guide interpretations have not been released.",
  "authorityBoundary": "Displaying or selecting a guide for preview does not grant product eligibility, purchase access, release approval, or access to an official reading. Each permission must be verified by the server.",
  "saju": "Selecting a guide changes only the presentation of the current Saju preview. The interpretation grounds and text remain unchanged.",
  "face": "Selecting a guide changes only the presentation of the face-reading preparation screen. Photo analysis and guide interpretation are not yet available.",
  "sourceNotice": "Character introductions remain in their original language and are not translated when the interface language changes."
}),
  'zh-CN': Object.freeze({
  "kicker": "引路人 · 预览场景",
  "portrait": "引路人肖像",
  "select": "选择引路人",
  "close": "关闭",
  "change": "更换",
  "previewOnly": "仅限预览",
  "conceptPending": "角色设定准备中",
  "selectionLimit": "目前仅能选择已支持的角色进行预览，付费引路人解读尚未开放。",
  "authorityBoundary": "展示或选择引路人预览不代表获得商品使用资格、购买权限、公开批准或正式解读查看权限。各项权限均须由服务器分别核实。",
  "saju": "选择引路人只会改变当前八字预览的展示方式，不会修改解读依据或正文。",
  "face": "选择引路人只会改变当前面相准备页面的展示方式。照片分析及引路人解读尚未开放。",
  "sourceNotice": "人物介绍保留原文，切换界面语言不会自动翻译。"
}),
} as const);

export function projectPlannedReaderPickerUiV1(requestedLocale: unknown) {
  if (requestedLocale !== 'en-US' && requestedLocale !== 'zh-CN') return null;
  return Object.freeze({
    uiLocale: requestedLocale,
    ...COPY[requestedLocale],
    activeUiLocaleAdmitted: false as const,
    characterIdentityLocalized: false as const,
    sourceTextTranslated: false as const,
    previewSelectionExpanded: false as const,
    purchaseAccessGranted: false as const,
    readerOutputLocalized: false as const,
    interpretationReleased: false as const,
  });
}
