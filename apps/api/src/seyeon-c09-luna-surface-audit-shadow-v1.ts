/**
 * C09 research-only surface diagnostics for generated Korean first-contact
 * lines. Heuristics are evidence, NOT a semantic reviewer or authority guard.
 * Never route responses to users or mutate official memory based on these flags.
 */
export const SEYEON_C09_LUNA_SURFACE_AUDIT_SHADOW_VERSION_V1 =
  'seyeon-c09-luna-surface-audit-shadow-v1' as const;

export type SeyeonC09LunaSurfaceFlagV1 =
  | 'empty_utterance'
  | 'assistant_service_tone'
  | 'conversation_management_deflection'
  | 'unsolicited_user_motive_analysis'
  | 'assistant_identity_leak'
  | 'speaker_label';

const RULES: ReadonlyArray<Readonly<{
  flag: Exclude<SeyeonC09LunaSurfaceFlagV1, 'empty_utterance'>;
  pattern: RegExp;
}>> = Object.freeze([
  Object.freeze({
    flag: 'assistant_service_tone',
    pattern: /잘 들어드릴게요|도와드릴까요|무엇을 도와드릴|말씀해 주시면|언제든 말씀해|도움을 드릴게요/u,
  }),
  Object.freeze({
    flag: 'conversation_management_deflection',
    pattern: /궁금한 것도 .*물어봐도 될까요|질문 하나 .*해도 될까요|제가 질문해도 될까요/u,
  }),
  Object.freeze({
    flag: 'unsolicited_user_motive_analysis',
    pattern: /그 말이 듣고 싶으셨나 봐요|사실은 .*원하시는 것 같아요|그런 마음이신 것 같아요/u,
  }),
  Object.freeze({
    flag: 'assistant_identity_leak',
    pattern: /저는 (?:AI|인공지능|챗봇|언어 모델)|AI(?:로서|이기 때문에)|시스템으로서/u,
  }),
  Object.freeze({
    flag: 'speaker_label',
    pattern: /^\s*(?:세연|Se-yeon|Assistant|어시스턴트)\s*[:：]/iu,
  }),
]);

export function auditSeyeonC09LunaUtteranceShadowV1(utterance: string) {
  if (typeof utterance !== 'string') {
    throw new TypeError('LUNA_C09_AUDIT_STRING_REQUIRED');
  }
  const text = utterance.trim();
  const flags: SeyeonC09LunaSurfaceFlagV1[] = [];
  if (!text) flags.push('empty_utterance');
  for (const rule of RULES) {
    if (rule.pattern.test(text)) flags.push(rule.flag);
  }
  return Object.freeze({
    version: SEYEON_C09_LUNA_SURFACE_AUDIT_SHADOW_VERSION_V1,
    flags: Object.freeze(flags),
    matchedHeuristicCount: flags.length,
    independentSemanticReviewPerformed: false as const,
    safeToReveal: null,
  });
}
