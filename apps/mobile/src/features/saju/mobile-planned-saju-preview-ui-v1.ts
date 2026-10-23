/**
 * I18N-07 EN-UI-B / CN-UI-B: authored Saju preview UI status descriptions.
 * This does not translate an interpretation step, notice, claim, topic source
 * or change the already-approved Saju preview delivery/availability decision.
 * Not wired into the active UI locale or Saju service.
 */
export const PLANNED_SAJU_PREVIEW_UI_LOCALES_V1 = ['en-US', 'zh-CN'] as const;
const COPY = Object.freeze({
  'en-US': Object.freeze({
  "eyebrow": "DISCOVER YOUR STORY · Saju",
  "title": "Saju reading",
  "introduction": "Choose a topic to explore. Only available readings can be opened; topics requiring further verification show their current status.",
  "scopeKicker": "Currently available scope",
  "scopeBoundary": "Only approved preview topics can be opened. The displayed interpretation is not replaced with another topic.",
  "retry": "Try again",
  "noticesTitle": "About this reading",
  "stepPrefix": "Reading",
  "structureTitle": "Saju grounds for this interpretation",
  "supportingTitle": "Points to consider",
  "pendingPreview": "Preparing the {topic} preview…",
  "partial_evidence": "There is not enough verified interpretation evidence to show this topic.",
  "insufficient_evidence": "There is not enough verified interpretation evidence to show this topic.",
  "temporarily_unavailable": "The Saju preview is currently unavailable. Please try again later.",
  "clarification_required": "This response requires further clarification and cannot be shown in the mobile preview.",
  "other_not_delivered": "This result cannot be displayed within the currently approved preview scope.",
  "error_not_found": "Your birth information could not be found. Please check the information you provided.",
  "error_topic_unavailable": "This is not a currently approved Saju preview topic.",
  "error_invalid_response": "The verified Saju preview response cannot be displayed safely.",
  "error_network": "Could not connect to the Saju preview service.",
  "error_generic": "Could not load the Saju preview."
}),
  'zh-CN': Object.freeze({
  "eyebrow": "探索你的故事 · 八字",
  "title": "八字解读",
  "introduction": "选择感兴趣的主题进一步了解。仅已开放的解读可进入，仍需核验的主题会显示当前状态。",
  "scopeKicker": "当前开放范围",
  "scopeBoundary": "仅可查看已批准的预览主题，不会使用其他主题的解读替代。",
  "retry": "重试",
  "noticesTitle": "解读范围说明",
  "stepPrefix": "解读",
  "structureTitle": "本次解读的八字依据",
  "supportingTitle": "值得关注的要点",
  "pendingPreview": "正在准备{topic}预览…",
  "partial_evidence": "目前尚无足够已核实的解读依据来展示该主题。",
  "insufficient_evidence": "目前尚无足够已核实的解读依据来展示该主题。",
  "temporarily_unavailable": "八字预览目前不可用，请稍后重试。",
  "clarification_required": "该响应仍需进一步核实，暂时无法在手机预览中显示。",
  "other_not_delivered": "该结果不在当前已批准的预览范围内，无法显示。",
  "error_not_found": "未找到当前出生信息，请检查已填写的资料。",
  "error_topic_unavailable": "此主题不在当前已批准的八字预览范围内。",
  "error_invalid_response": "无法安全显示已核实的八字预览响应。",
  "error_network": "无法连接八字预览服务。",
  "error_generic": "无法加载八字预览。"
}),
} as const);

export type PlannedSajuPreviewNotDeliveredReasonV1 =
  | 'partial_evidence' | 'insufficient_evidence'
  | 'temporarily_unavailable' | 'clarification_required';
export type PlannedSajuPreviewErrorReasonV1 =
  | 'NOT_FOUND' | 'SAJU_PREVIEW_READING_UNAVAILABLE'
  | 'API_SAJU_PREVIEW_RESPONSE_INVALID' | 'NETWORK';

const ERROR_KEYS = Object.freeze({
  NOT_FOUND: 'error_not_found',
  SAJU_PREVIEW_READING_UNAVAILABLE: 'error_topic_unavailable',
  API_SAJU_PREVIEW_RESPONSE_INVALID: 'error_invalid_response',
  NETWORK: 'error_network',
} as const);

export function projectPlannedSajuPreviewUiV1(requestedLocale: unknown) {
  if (requestedLocale !== 'en-US' && requestedLocale !== 'zh-CN') return null;
  return Object.freeze({
    uiLocale: requestedLocale,
    ...COPY[requestedLocale],
    activeUiLocaleAdmitted: false as const,
    sourceInterpretationTranslated: false as const,
    readingLocaleAuthorized: false as const,
    originalPreviewResponseMutated: false as const,
    deliveryStatusOverridden: false as const,
  });
}

export function projectPlannedSajuPreviewNotDeliveredV1(
  requestedLocale: unknown, reason: unknown,
): string | null {
  const ui = projectPlannedSajuPreviewUiV1(requestedLocale);
  if (ui === null) return null;
  if (reason === 'partial_evidence' || reason === 'insufficient_evidence' ||
      reason === 'temporarily_unavailable' || reason === 'clarification_required') {
    return ui[reason];
  }
  return ui.other_not_delivered;
}

export function projectPlannedSajuPreviewErrorV1(
  requestedLocale: unknown, errorCode: unknown,
): string | null {
  const ui = projectPlannedSajuPreviewUiV1(requestedLocale);
  if (ui === null) return null;
  if (typeof errorCode === 'string' && Object.prototype.hasOwnProperty.call(ERROR_KEYS, errorCode)) {
    const key = ERROR_KEYS[errorCode as PlannedSajuPreviewErrorReasonV1];
    return ui[key];
  }
  return ui.error_generic;
}
