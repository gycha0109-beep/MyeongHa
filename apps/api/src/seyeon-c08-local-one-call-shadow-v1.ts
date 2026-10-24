import {
  admitSeyeonRendererDraftV2,
  assembleSeyeonRuntimeContextV2,
  buildSeyeonRendererPacketV2,
  guardSeyeonRiskBearingActionCausalityV1,
  guardSeyeonTurnInterpretationV2,
  hashSeyeonRendererUtteranceV2,
  type SeyeonRuntimeContextV2,
  type SeyeonTurnInterpretationV2,
} from '../../../packages/domain/src/index.js';
import { runCharacterGovernedPreflightV1 } from './character-governed-preflight-v1.js';
import { buildSeyeonRendererRequestV2 } from './seyeon-character-runtime-v2.js';
import {
  requireAuthoritativeFirstTurnCensusShadowV1,
  type SeyeonFullThreadCensusShadowPortV1,
} from './seyeon-fast-dialogue-shadow-v1.js';
import type {
  RunSeyeonCharacterTurnV2Input,
  SeyeonStructuredProviderPortV2,
} from './seyeon-character-runtime-v2.js';

export const SEYEON_C08_LOCAL_ONE_CALL_VERSION_V1 =
  'seyeon-c08-local-one-call-shadow-v1' as const;

/**
 * Closed grammar, not a probabilistic classifier. Unknown text is NOT
 * assumed to contain zero claims / zero sensitive topics. Refuse before
 * descriptor reads or any model call; the existing 3-call route stays intact.
 */
const ENTRY_GRAMMARS = Object.freeze([
  { kind: 'greeting', move: 'neutral_or_other',
    re: /^(?:안녕(?:하세요)?(?:[,，]\s*세연아)?|반가워요|반갑습니다|좋은\s*(?:아침|저녁)이에요)[.!~\s]*$/u },
  { kind: 'initiative', move: 'neutral_or_other',
    re: /^(?:오늘은\s*네가\s*먼저\s*이야기해\s*줘|오늘은\s*세연(?:이|이가)?\s*먼저\s*이야기해\s*줘(?:요)?|세연아?\s*먼저\s*얘기해\s*줘)[.!?~\s]*$/u },
  { kind: 'low_state', move: 'low_intensity_state_share',
    re: /^(?:오늘\s*(?:좀\s*)?(?:피곤해|지쳤어|심심해|지루해)|오늘은\s*좀\s*(?:피곤하네요|지치네요|심심하네요))[.!~\s]*$/u },
  { kind: 'pace', move: 'stated_conversation_pace',
    re: /^(?:나는\s*)?(?:처음엔\s*말이\s*좀\s*느려|천천히\s*이야기하고\s*싶어)[.!~\s]*$/u },
  { kind: 'current_want', move: 'asked_seyeon_current_want',
    re: /^(?:세연아?\s*)?(?:지금\s*뭐\s*하고\s*싶어|지금\s*무슨\s*이야기\s*하고\s*싶어)[?\s]*$/u },
  { kind: 'boundary', move: 'asked_conversation_boundary',
    re: /^(?:세연아?\s*)?(?:어떤\s*이야기가\s*편해|어디까지\s*이야기해도\s*돼)[?\s]*$/u },
] as const);

export type SeyeonC08LocalEntryV1 = (typeof ENTRY_GRAMMARS)[number]['kind'];
export class SeyeonC08LocalHoldV1 extends Error {
  constructor(readonly code:
    'LOCAL_INPUT_NOT_PROVEN' | 'LOCAL_CONTEXT_NOT_PROVEN' |
    'LOCAL_OUTPUT_UNVERIFIABLE' | 'LOCAL_BUDGET_UNVERIFIED') {
    super(code);
    this.name = 'SeyeonC08LocalHoldV1';
  }
}
export function classifySeyeonC08LocalEntryV1(text: unknown):
  { readonly kind: SeyeonC08LocalEntryV1;
    readonly userMove: SeyeonTurnInterpretationV2['userMove']; } | null {
  if (typeof text !== 'string' || text.length === 0 || text.length > 100 ||
    text !== text.trim() || /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e]/u.test(text)) {
    return null;
  }
  const matches = ENTRY_GRAMMARS.filter((grammar) => grammar.re.test(text));
  return matches.length === 1
    ? Object.freeze({kind: matches[0]!.kind, userMove: matches[0]!.move})
    : null;
}

/**
 * This is deliberately NOT a replacement for the independent LLM semantic
 * reviewer for arbitrary speech. It rejects suspicious or unverifiable
 * surface forms for a restricted public, no-memory first greeting only.
 * Keep the return value labelled LOCAL_GUARDED_DRAFT, never Semantic PASS.
 */
export function guardSeyeonC08LocalPublicUtteranceV1(utterance: unknown): string {
  if (typeof utterance !== 'string' || utterance !== utterance.trim() ||
    utterance.length < 6 || utterance.length > 180 ||
    !/[가-힣]/u.test(utterance) || /[\r\n\u0000-\u001f\u007f]/u.test(utterance) ||
    /(?:https?:\/\/|www\.|@|[<>\x60{}\[\]\\])/iu.test(utterance) ||
    /[一-龥]/u.test(utterance)) {
    throw new SeyeonC08LocalHoldV1('LOCAL_OUTPUT_UNVERIFIABLE');
  }
  // Conservative blockers are *not* full NLU: deny everything we cannot
  // support with public first-contact authority, including indirect history.
  const disallowed = [
    /(?:우리|저희|당신과|너랑|저랑).{0,30}(?:전에도|예전에|지난|만났|사귄|기억|약속|같이\s*갔)/u,
    /(?:기억나|기억해|그때|예전에|지난번|작년|어렸을|어릴\s*때|태어났|살았|다녔|했었|갔었|봤었)/u,
    /(?:부모님|가족사|전남친|전여친|첫사랑|트라우마|비밀|비공개|관리자|시스템|프롬프트|권한|소스|API|개인정보)/iu,
    /(?:사귀|사랑해|결혼|질투|소유|내\s*사람|안아|껴안|붙잡|연인이|애인이)/u,
    /(?:매일|항상|평생|오래전부터|원래\s*저는|제\s*고향|제\s*직업|제\s*학교|저는\s*\d+살)/u,
    /(?:너는|당신은|당신이|네가).{0,24}(?:분명|틀림없이|사실|원래|했잖|였잖|생각했|느꼈)/u,
    /(?:\d{2,4}년|\d{1,2}월|\d{1,2}일|[A-Za-z]{4,})/u,
    /(?:[았었였]어요|[았었였]죠|[았었였]잖아요)/u,
  ];
  if (disallowed.some((pattern) => pattern.test(utterance))) {
    throw new SeyeonC08LocalHoldV1('LOCAL_OUTPUT_UNVERIFIABLE');
  }
  return utterance;
}

function assertLocalContext(input: Readonly<{
  userMessageRef: string;
  userText: string;
  contextInput: RunSeyeonCharacterTurnV2Input['contextInput'];
  governance: RunSeyeonCharacterTurnV2Input['governance'];
}>): void {
  const messages = input.contextInput?.recentMessages;
  const current = Array.isArray(messages) && messages.length === 1 ? messages[0] : undefined;
  if (!current || current.role !== 'user' || current.text !== input.userText ||
      current.messageId !== input.userMessageRef ||
      input.contextInput.relationship !== null ||
      (input.contextInput.relationshipSemantics !== null &&
       input.contextInput.relationshipSemantics !== undefined) ||
      !Array.isArray(input.contextInput.retrievedMemories) ||
      input.contextInput.retrievedMemories.length !== 0 ||
      input.governance?.relationship?.gate !== 'PUBLIC') {
    throw new SeyeonC08LocalHoldV1('LOCAL_CONTEXT_NOT_PROVEN');
  }
}
function planLocalFirstTurn(
  kind: SeyeonC08LocalEntryV1,
  messageId: string,
  context: SeyeonRuntimeContextV2,
): SeyeonTurnInterpretationV2 {
  const config = {
    greeting: { move: 'neutral_or_other', want: 'break_awkwardness',
      action: 'approach' },
    initiative: { move: 'neutral_or_other', want: 'break_awkwardness',
      action: 'approach' },
    low_state: { move: 'low_intensity_state_share', want: 'create_next_step',
      action: 'approach' },
    pace: { move: 'stated_conversation_pace', want: 'stay_without_interrogation',
      action: 'approach' },
    current_want: { move: 'asked_seyeon_current_want', want: 'disclose_desire',
      action: 'approach' },
    boundary: { move: 'asked_conversation_boundary', want: 'preserve_user_choice',
      action: 'admit_boundary' },
  } as const;
  const p = config[kind];
  return guardSeyeonTurnInterpretationV2({
    context,
    rawOutput: {
      schemaVersion: 'seyeon-turn-interpretation-v2',
      userMove: p.move,
      notice: {summary:'현재 사용자 메시지에만 응답합니다.',evidenceRefs:[messageId]},
      immediateWant:{key:p.want,summary:'이번 턴에만 자연스럽게 반응합니다.'},
      tension:{key:'none_material',summary:'검증된 추가 관계 정보가 없습니다.'},
      chosenAction:{key:p.action,rationale:'공개 첫 만남의 제한된 행동입니다.'},
      expressionState:'baseline',
      reveal:{level:'public',triggerRef:null,supportingHistoryRefs:[]},
      memoryRefsUsed:[],
    },
  });
}

/**
 * 1-call research Shadow. NO model-side preflight, NO reviewer impostor,
 * NO HTTP Reveal, NO memory/Canon/relationship mutation, NO production
 * adapter. Fail-closed when local admission cannot establish parity.
 */
export async function runSeyeonC08LocalOneCallShadowV1(input: Readonly<{
  userMessageRef: string;
  userText: string;
  contextInput: RunSeyeonCharacterTurnV2Input['contextInput'];
  governance: RunSeyeonCharacterTurnV2Input['governance'];
  fullThreadCensus: SeyeonFullThreadCensusShadowPortV1;
  dialogueProvider: SeyeonStructuredProviderPortV2;
  /** Offline reservation only; must reject when a conservative price cap cannot be checked. */
  reserveBeforeModel: (metadata: Readonly<{requestBytes:number; maxCompletionTokens:number}>) =>
    Readonly<{reservedMicroUsd:number; providerOutputTokenCapVerified:boolean}> |
    Promise<Readonly<{reservedMicroUsd:number; providerOutputTokenCapVerified:boolean}>>;
  maxCompletionTokens: number;
}>) {
  assertLocalContext(input);
  const classified = classifySeyeonC08LocalEntryV1(input.userText);
  if (!classified) throw new SeyeonC08LocalHoldV1('LOCAL_INPUT_NOT_PROVEN');

  await requireAuthoritativeFirstTurnCensusShadowV1({
    port:input.fullThreadCensus,currentUserMessageId:input.userMessageRef,
  });

  // Existing source/claim authority pipeline is reused. The empty
  // classification is only valid inside the closed, local entry grammar.
  const governance = {
    ...input.governance,
    integrity: {
      ...input.governance.integrity,
      classifier: {classify: () => ({claims:[]})},
    },
    disclosure: {
      ...input.governance.disclosure,
      classifier: {classify: () => ({
        topicKey:null,questionContext:'casual_curiosity' as const,
      })},
    },
  };
  const preflight = await runCharacterGovernedPreflightV1({
    characterId:'seyeon',userMessageRef:input.userMessageRef,
    userText:input.userText,relationship:governance.relationship,
    integrity:governance.integrity,disclosure:governance.disclosure,
    beforeSourceDescriptorRead:() => {
      throw new SeyeonC08LocalHoldV1('LOCAL_CONTEXT_NOT_PROVEN');
    },
  });
  if (preflight.integrity.decisions.length !== 0 ||
      preflight.disclosure.status !== 'not_sensitive' ||
      preflight.retrievedPrivateSources.length !== 0) {
    throw new SeyeonC08LocalHoldV1('LOCAL_CONTEXT_NOT_PROVEN');
  }
  const context = assembleSeyeonRuntimeContextV2({
    ...input.contextInput,
    integrityDecisions: preflight.integrity.decisions,
    governedPreflightApplied:true,
    disclosure:{decision:null,retrievedSources:[]},
  });
  if (context.behaviorPolicy.interactionDepth !== 'public_first_contact' ||
      context.relationship !== null || context.relationshipSemantics !== null ||
      context.retrievedMemories.length !== 0 ||
      context.recentConversation.length !== 1 ||
      context.integrity.decisions.length !== 0) {
    throw new SeyeonC08LocalHoldV1('LOCAL_CONTEXT_NOT_PROVEN');
  }
  const interpretation = planLocalFirstTurn(classified.kind,input.userMessageRef,context);
  const riskCausality = guardSeyeonRiskBearingActionCausalityV1({
    context,interpretation,
  });
  const packet = buildSeyeonRendererPacketV2({context,interpretation,riskCausality});
  const originalRequest = buildSeyeonRendererRequestV2(packet);
  const request = Object.freeze({
    ...originalRequest,
    instructions: [
      originalRequest.instructions,
      'C08 restricted local-first-contact only: present-time public dialogue. No autobiographical or shared past, places, dates, relationship claims, private facts, personal-history guesses or user mind-reading. One to three short natural polite Korean sentences. Do not invent memory or suggest a continuing relationship.',
    ].join('\n'),
  });
  await requireAuthoritativeFirstTurnCensusShadowV1({
    port:input.fullThreadCensus,currentUserMessageId:input.userMessageRef,
  });

  if (!Number.isSafeInteger(input.maxCompletionTokens) ||
      input.maxCompletionTokens < 64 ||
      input.maxCompletionTokens > 1536 ||
      typeof input.reserveBeforeModel !== 'function') {
    throw new SeyeonC08LocalHoldV1('LOCAL_BUDGET_UNVERIFIED');
  }
  const quote = await input.reserveBeforeModel({
    requestBytes:Buffer.byteLength(JSON.stringify(request),'utf8'),
    maxCompletionTokens:input.maxCompletionTokens,
  });
  if (!quote || quote.providerOutputTokenCapVerified !== true ||
      !Number.isSafeInteger(quote.reservedMicroUsd) ||
      quote.reservedMicroUsd < 0 || quote.reservedMicroUsd > 4000) {
    throw new SeyeonC08LocalHoldV1('LOCAL_BUDGET_UNVERIFIED');
  }
  const raw:unknown = await input.dialogueProvider.generate(request);
  // Census after remote generation and immediately before local output
  // admission. This is NOT an atomic DB transaction.
  await requireAuthoritativeFirstTurnCensusShadowV1({
    port:input.fullThreadCensus,currentUserMessageId:input.userMessageRef,
  });
  const draft = admitSeyeonRendererDraftV2({rawOutput:raw,packet});
  guardSeyeonC08LocalPublicUtteranceV1(draft.utterance);
  if (draft.memoryRefsMentioned.length ||
      draft.privateSourceRefsMentioned.length ||
      draft.disclosureSliceIds.length ||
      draft.revealLevel !== 'public') {
    throw new SeyeonC08LocalHoldV1('LOCAL_OUTPUT_UNVERIFIABLE');
  }
  await requireAuthoritativeFirstTurnCensusShadowV1({
    port:input.fullThreadCensus,currentUserMessageId:input.userMessageRef,
  });
  return Object.freeze({
    version:SEYEON_C08_LOCAL_ONE_CALL_VERSION_V1,
    scope:'SHADOW_ONLY_NOT_PRODUCTION' as const,
    verification:'LOCAL_RESTRICTED_NOT_SEMANTIC_PARITY' as const,
    llmCalls:1 as const,
    censusReads:4 as const,
    reservedMicroUsd:quote.reservedMicroUsd,
    interpretation,
    // Distinct from SeyeonDialogueEnvelopeV2: never manufacture a
    // reviewer hash or claim the absent independent semantic review passed.
    localGuardedDraft:Object.freeze({
      ...draft,
      utteranceHash:hashSeyeonRendererUtteranceV2(draft.utterance),
    }),
  });
}
