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
import type { SeyeonFullThreadCensusShadowPortV1 }
  from './seyeon-fast-dialogue-shadow-v1.js';
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
    'LOCAL_OUTPUT_UNVERIFIABLE' | 'LOCAL_BUDGET_UNVERIFIED' | 'LOCAL_PROVIDER_FAILURE') {
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
    /(?:매일|항상|평생|오래전부터|원래\s*저는|제\s*고향|제\s*직업|제\s*학교|제\s*이름|제\s*집|제가\s*살|저는\s*\d+살)/u,
    /(?:너는|당신은|당신이|네가).{0,24}(?:분명|틀림없이|사실|원래|했잖|였잖|생각했|느꼈)/u,
    /(?:원하시면|무엇을\s*도와|도움이\s*필요|도와드릴|상담해|메뉴를\s*골라|푹\s*쉬|충분히\s*쉬|기운\s*내|화이팅|행복해질\s*거예요)/u,
    /(?:\d{2,4}년|\d{1,2}월|\d{1,2}일|[A-Za-z]{4,})/u,
    /(?:[았었였]어요|[았었였]죠|[았었였]잖아요)/u,
  ];
  if (disallowed.some((pattern) => pattern.test(utterance))) {
    throw new SeyeonC08LocalHoldV1('LOCAL_OUTPUT_UNVERIFIABLE');
  }
  return utterance;
}

/**
 * Minimal act-specific, local postconditions. These are deliberately
 * necessary-not-sufficient surface checks, not a claim of semantic equivalence
 * to a model reviewer. Reject unclear output instead of calling another LLM.
 */
export function guardSeyeonC08LocalMoveV1(kind: SeyeonC08LocalEntryV1,
  utterance: string): void {
  const requires:Record<SeyeonC08LocalEntryV1, readonly RegExp[]> = {
    greeting: [/안녕|반갑|처음/u],
    initiative: [/저는|제가|저도/u],
    low_state: [/지치|피곤|심심|지루|오늘/u,/저는|제가|저도/u],
    pace: [/천천히|서두르|조용|침묵|속도/u],
    current_want: [/저는|제가|저도/u,/지금|오늘/u],
    boundary: [/편해|괜찮|선호|좋아|원하/u],
  };
  if(!requires[kind] || !requires[kind].every(re=>re.test(utterance))){
    throw new SeyeonC08LocalHoldV1('LOCAL_OUTPUT_UNVERIFIABLE');
  }
}

/**
 * Full-thread count must match the ENTIRE supplied dialogue, not a truncated
 * recent-message window. Prior entries are only locally admissible public
 * texts: no memory-backed/relationship-backed conversation can enter here.
 */
/**
 * Offline conservative upper-bound reservation for one model request.
 * Since input tokenization varies, byte count is treated as an upper bound
 * on input tokens. USD per million tokens numerically equals microUSD/token.
 * No inference/billing claim follows from this local reservation.
 */
export function quoteSeyeonC08LocalOneCallBudgetV1(input: Readonly<{
  requestBytes:number;
  maxCompletionTokens:number;
  inputUsdPerMillion:number;
  outputUsdPerMillion:number;
  providerOutputTokenCapVerified:boolean;
}>):Readonly<{reservedMicroUsd:number;providerOutputTokenCapVerified:true;
  hardBillingCapVerified:false}> {
  if (!Number.isSafeInteger(input?.requestBytes) ||
      input.requestBytes<1 || input.requestBytes>32768 ||
      !Number.isSafeInteger(input.maxCompletionTokens) ||
      input.maxCompletionTokens<64 || input.maxCompletionTokens>1536 ||
      typeof input.inputUsdPerMillion!=='number' ||
      !Number.isFinite(input.inputUsdPerMillion) ||
      input.inputUsdPerMillion<=0 || input.inputUsdPerMillion>5 ||
      typeof input.outputUsdPerMillion!=='number' ||
      !Number.isFinite(input.outputUsdPerMillion) ||
      input.outputUsdPerMillion<=0 || input.outputUsdPerMillion>10 ||
      input.providerOutputTokenCapVerified!==true) {
    throw new SeyeonC08LocalHoldV1('LOCAL_BUDGET_UNVERIFIED');
  }
  const reservedMicroUsd=Math.ceil(
    input.requestBytes*input.inputUsdPerMillion+
    input.maxCompletionTokens*input.outputUsdPerMillion,
  );
  if(!Number.isSafeInteger(reservedMicroUsd) ||
     reservedMicroUsd<=0 || reservedMicroUsd>4000)
    throw new SeyeonC08LocalHoldV1('LOCAL_BUDGET_UNVERIFIED');
  return Object.freeze({
    reservedMicroUsd,providerOutputTokenCapVerified:true as const,
    hardBillingCapVerified:false as const,
  });
}

function assertLocalContext(input: Readonly<{
  userMessageRef: string;
  userText: string;
  contextInput: RunSeyeonCharacterTurnV2Input['contextInput'];
  governance: RunSeyeonCharacterTurnV2Input['governance'];
}>): number {
  const messages = input.contextInput?.recentMessages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 7 ||
      messages.length % 2 !== 1 ||
      input.contextInput.relationship !== null ||
      !Array.isArray(input.contextInput.retrievedMemories) ||
      input.contextInput.retrievedMemories.length !== 0 ||
      input.governance?.relationship?.gate !== 'PUBLIC') {
    throw new SeyeonC08LocalHoldV1('LOCAL_CONTEXT_NOT_PROVEN');
  }
  const seenIds=new Set<string>();
  for (let i=0; i<messages.length; i++){
    const message=messages[i];
    if (!message || typeof message.messageId!=='string' ||
        message.messageId.length===0 || message.messageId.length>256 ||
        seenIds.has(message.messageId) ||
        message.role!==(i%2===0?'user':'assistant')) {
      throw new SeyeonC08LocalHoldV1('LOCAL_CONTEXT_NOT_PROVEN');
    }
    seenIds.add(message.messageId);
    if (message.role==='user'){
      // Prior user messages must be locally provable history; the current
      // message is classified separately as LOCAL_INPUT_NOT_PROVEN.
      if (i<messages.length-1 &&
          !classifySeyeonC08LocalEntryV1(message.text)) {
        throw new SeyeonC08LocalHoldV1('LOCAL_CONTEXT_NOT_PROVEN');
      }
    }else {
      try{guardSeyeonC08LocalPublicUtteranceV1(message.text);}
      catch{throw new SeyeonC08LocalHoldV1('LOCAL_CONTEXT_NOT_PROVEN');}
    }
  }
  const current=messages[messages.length-1]!;
  if (current.role!=='user' || current.messageId!==input.userMessageRef ||
      current.text!==input.userText) {
    throw new SeyeonC08LocalHoldV1('LOCAL_CONTEXT_NOT_PROVEN');
  }
  return messages.length;
}
async function requireSeyeonC08PublicThreadCensusV1(
  port: SeyeonFullThreadCensusShadowPortV1,
  currentUserMessageId:string,expectedCount:number,
):Promise<void>{
  const fail=()=>new SeyeonC08LocalHoldV1('LOCAL_CONTEXT_NOT_PROVEN');
  if(!port || typeof port.subjectId!=='string' ||
     port.subjectId.length<1 || port.subjectId.length>256 ||
     port.subjectId.trim()!==port.subjectId ||
     typeof port.threadId!=='string' ||
     port.threadId.length<1 || port.threadId.length>256 ||
     port.threadId.trim()!==port.threadId ||
     typeof currentUserMessageId!=='string' ||
     currentUserMessageId.length<1 || currentUserMessageId.length>256 ||
     currentUserMessageId.trim()!==currentUserMessageId ||
     typeof port.readFullThreadCensus!=='function' ||
     !Number.isSafeInteger(expectedCount) || expectedCount<1 || expectedCount>7){
    throw fail();
  }
  let raw:unknown;
  try{
    raw=await port.readFullThreadCensus({
      subjectId:port.subjectId,threadId:port.threadId,
      currentUserMessageId,
    });
  }catch{throw fail();}
  if(typeof raw!=='object' || raw===null || Array.isArray(raw))throw fail();
  const c=raw as Record<string,unknown>;
  if(Object.keys(c).length!==7 ||
     c.schemaVersion!=='seyeon-first-turn-census-shadow-v1' ||
     c.subjectId!==port.subjectId || c.threadId!==port.threadId ||
     c.currentUserMessageId!==currentUserMessageId ||
     c.messageCount!==expectedCount || c.latestSenderType!=='user' ||
     c.complete!==true)throw fail();
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
 * 1-call public/no-memory research Shadow (up to 7 full thread messages).
 * NO model-side preflight, NO reviewer impostor,
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
  const expectedCount=assertLocalContext(input);
  const classified = classifySeyeonC08LocalEntryV1(input.userText);
  if (!classified) throw new SeyeonC08LocalHoldV1('LOCAL_INPUT_NOT_PROVEN');

  await requireSeyeonC08PublicThreadCensusV1(
    input.fullThreadCensus,input.userMessageRef,expectedCount,
  );

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
      context.recentConversation.length !== expectedCount ||
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
  await requireSeyeonC08PublicThreadCensusV1(
    input.fullThreadCensus,input.userMessageRef,expectedCount,
  );

  if (!Number.isSafeInteger(input.maxCompletionTokens) ||
      input.maxCompletionTokens < 64 ||
      input.maxCompletionTokens > 1536 ||
      typeof input.reserveBeforeModel !== 'function') {
    throw new SeyeonC08LocalHoldV1('LOCAL_BUDGET_UNVERIFIED');
  }
  const requestBytes=Buffer.byteLength(JSON.stringify(request),'utf8');
  if(requestBytes<1 || requestBytes>32768){
    throw new SeyeonC08LocalHoldV1('LOCAL_BUDGET_UNVERIFIED');
  }
  const quote = await input.reserveBeforeModel({
    requestBytes,maxCompletionTokens:input.maxCompletionTokens,
  });
  if (!quote || quote.providerOutputTokenCapVerified !== true ||
      !Number.isSafeInteger(quote.reservedMicroUsd) ||
      quote.reservedMicroUsd <= 0 || quote.reservedMicroUsd > 4000) {
    throw new SeyeonC08LocalHoldV1('LOCAL_BUDGET_UNVERIFIED');
  }
  let raw:unknown;
  try{raw=await input.dialogueProvider.generate(request);}
  catch{throw new SeyeonC08LocalHoldV1('LOCAL_PROVIDER_FAILURE');}
  // Census after remote generation and immediately before local output
  // admission. This is NOT an atomic DB transaction.
  await requireSeyeonC08PublicThreadCensusV1(
    input.fullThreadCensus,input.userMessageRef,expectedCount,
  );
  const draft = admitSeyeonRendererDraftV2({rawOutput:raw,packet});
  guardSeyeonC08LocalPublicUtteranceV1(draft.utterance);
  guardSeyeonC08LocalMoveV1(classified.kind,draft.utterance);
  const questionCount=(draft.utterance.match(/[?？]/gu)??[]).length;
  if(questionCount>context.behaviorPolicy.maxQuestionsPerUtterance){
    throw new SeyeonC08LocalHoldV1('LOCAL_OUTPUT_UNVERIFIABLE');
  }
  if (draft.memoryRefsMentioned.length ||
      draft.privateSourceRefsMentioned.length ||
      draft.disclosureSliceIds.length ||
      draft.revealLevel !== 'public') {
    throw new SeyeonC08LocalHoldV1('LOCAL_OUTPUT_UNVERIFIABLE');
  }
  await requireSeyeonC08PublicThreadCensusV1(
    input.fullThreadCensus,input.userMessageRef,expectedCount,
  );
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
