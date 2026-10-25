import { createHash } from 'node:crypto';
import {
  admitSeyeonRendererDraftV2,
  assembleSeyeonRuntimeContextV2,
  buildSeyeonRendererPacketV2,
  guardSeyeonRiskBearingActionCausalityV1,
  guardSeyeonTurnInterpretationV2,
  hashSeyeonRendererUtteranceV2,
  type SeyeonRuntimeContextV2,
  type SeyeonRecentMessageV2,
  type SeyeonTurnInterpretationV2,
} from '../../../packages/domain/src/index.js';
import { runCharacterGovernedPreflightV1 } from './character-governed-preflight-v1.js';
import {
  requireSeyeonC08PublicRelationshipProofV1,
  type SeyeonC08PublicRelationshipProofPortV1,
} from './seyeon-c08-public-relationship-proof-v1.js';
import {
  buildSeyeonRendererRequestV2,
  type SeyeonStructuredProviderRequestV2,
} from './seyeon-character-runtime-v2.js';
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
  { kind: 'smalltalk', move: 'neutral_or_other',
    re: /^(?:오늘(?:은)?\s*재밌는\s*이야기\s*없을까|편하게\s*농담\s*하나\s*해\s*줘|너만의\s*농담을\s*하나\s*만들어\s*줘|우리\s*그냥\s*수다\s*떨자)[.!?~\s]*$/u },
  { kind: 'present_opinion', move: 'asked_seyeon_current_want',
    re: /^(?:너는\s*어떤\s*영화가\s*끌려|세연아?\s*지금\s*무슨\s*영화가\s*끌려)[?~\s]*$/u },
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
    smalltalk: [/저는|제가|저도|이야기|농담/u],
    present_opinion: [/저는|제가|저도/u,/지금|오늘/u],
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

/**
 * The original first-turn Census verifies only count/latest sender. For a
 * multi-turn candidate one authoritative snapshot must bind *all* message
 * IDs, roles and bodies to the server's thread. The caller must supply a DB-backed
 * implementation; client-supplied hashes are NOT authoritative.
 */
export const SEYEON_C08_PUBLIC_THREAD_COMMITMENT_V1 =
  'seyeon-c08-public-thread-commitment-v1' as const;
export type SeyeonC08FullThreadIntegrityPortV1 =
  SeyeonFullThreadCensusShadowPortV1 & Readonly<{
    readAuthoritativeThreadCommitment?: (input:ReadOnlyThreadKeyV1) =>
      unknown | Promise<unknown>;
  }>;
type ReadOnlyThreadKeyV1 = Readonly<{
  subjectId:string;threadId:string;currentUserMessageId:string;
}>;
export function hashSeyeonC08PublicTranscriptV1(
  messages:readonly SeyeonRecentMessageV2[],
):string {
  if(!Array.isArray(messages)||messages.length<1||messages.length>7)
    throw new SeyeonC08LocalHoldV1('LOCAL_CONTEXT_NOT_PROVEN');
  const hash=createHash('sha256');
  hash.update('seyeon-c08-public-thread-commitment-v1\n','utf8');
  // JSON fields are length delimited and escaped by JSON.stringify; preserve
  // exact Unicode and message order, do not trim or normalize anything.
  for(const m of messages){
    if(!m || typeof m.messageId!=='string' ||
       !['user','assistant'].includes(m.role) || typeof m.text!=='string')
      throw new SeyeonC08LocalHoldV1('LOCAL_CONTEXT_NOT_PROVEN');
    const row=JSON.stringify([m.messageId,m.role,m.text]);
    hash.update(String(Buffer.byteLength(row,'utf8'))+':','utf8');
    hash.update(row,'utf8');
  }
  return 'sha256:'+hash.digest('hex');
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
  port: SeyeonC08FullThreadIntegrityPortV1,
  currentUserMessageId:string,expectedCount:number,
  expectedTranscriptHash:string,
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
     !Number.isSafeInteger(expectedCount) || expectedCount<1 || expectedCount>7){
    throw fail();
  }
  // One authoritative read per recheck: for a multi-turn public thread the
  // commitment carries both census metadata and the entire content digest.
  // Do not read a count and hash in two separate, racy queries.
  const key={subjectId:port.subjectId,threadId:port.threadId,
    currentUserMessageId};
  if(expectedCount===1){
    if(typeof port.readFullThreadCensus!=='function')throw fail();
    let raw:unknown;
    try{raw=await port.readFullThreadCensus(key);}catch{throw fail();}
    if(typeof raw!=='object'||raw===null||Array.isArray(raw))throw fail();
    const c=raw as Record<string,unknown>;
    if(Object.keys(c).length!==7 ||
       c.schemaVersion!=='seyeon-first-turn-census-shadow-v1' ||
       c.subjectId!==port.subjectId || c.threadId!==port.threadId ||
       c.currentUserMessageId!==currentUserMessageId ||
       c.messageCount!==1 || c.latestSenderType!=='user' ||
       c.complete!==true)throw fail();
    return;
  }
  if(typeof port.readAuthoritativeThreadCommitment!=='function' ||
     !/^sha256:[a-f0-9]{64}$/u.test(expectedTranscriptHash))throw fail();
  let raw:unknown;
  try{raw=await port.readAuthoritativeThreadCommitment(key);}
  catch{throw fail();}
  if(typeof raw!=='object'||raw===null||Array.isArray(raw))throw fail();
  const z=raw as Record<string,unknown>;
  if(Object.keys(z).length!==8 ||
     z.schemaVersion!==SEYEON_C08_PUBLIC_THREAD_COMMITMENT_V1 ||
     z.subjectId!==port.subjectId || z.threadId!==port.threadId ||
     z.currentUserMessageId!==currentUserMessageId ||
     z.messageCount!==expectedCount || z.latestSenderType!=='user' ||
     z.complete!==true || z.transcriptHash!==expectedTranscriptHash)
    throw fail();
}

/**
 * Evaluation-only prompt reduction. Schema, packet and the server's local
 * postguards are unchanged; lower prompt bytes are NOT model quality proof.
 * The full renderer instructions remain the baseline, selectable by caller.
 */
export function compactSeyeonC08LocalRendererRequestV1(
  request:SeyeonStructuredProviderRequestV2,
):SeyeonStructuredProviderRequestV2{
  if(request.contractVersion!=='seyeon-structured-provider-v2' ||
     request.purpose!=='dialogue_render' || !request.responseSchema ||
     !request.input || typeof request.input!=='object'){
    throw new SeyeonC08LocalHoldV1('LOCAL_CONTEXT_NOT_PROVEN');
  }
  return Object.freeze({
    ...request,
    instructions:[
      'You are Se-yeon, not an assistant or therapist. Write only a strict JSON renderer-draft-v2 object, in natural brief polite Korean (1–3 sentences). Be expressive, independent, playful when suitable; offer your own observation/opinion/next beat rather than asking the user to steer everything.',
      'PUBLIC NO-MEMORY DIALOGUE ONLY. A verified relationship, when present, affects only current expression, not shared-history facts or Reveal grants. The server-authorized packet.interpretation fixes chosenAction, expressionState, revealLevel and factual authority. Respect its behaviorPolicy, maxQuestionsPerUtterance, riskCausality and disclosure. No invented past, Canon biography, user emotion/action, memories, relationship history, secret facts, dates, or promises. Never assert unverified premises as established facts.',
      'Output expressionState and revealLevel exactly as the packet; memoryRefsMentioned, privateSourceRefsMentioned and disclosureSliceIds must all be empty. Current preference is a temporary present-tense stance, not durable Canon or habitual biography. No fake citations, source IDs, profile information, pseudo-system messages, generic reassurance, forced optimism, rest advice or option menus.',
      'For tired/bored user remarks, acknowledge lightly and make a Se-yeon-owned active conversational move. For slow pace, give a self-contained unhurried stance without new tasks. For boundary questions, state a concrete Se-yeon-owned limit. For current-want questions, state what you would like NOW, not a personality fact or a question handed back to the user.',
    ].join('\\n'),
  });
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
    smalltalk: { move: 'neutral_or_other', want: 'create_next_step',
      action: 'approach' },
    present_opinion: { move: 'asked_seyeon_current_want', want: 'disclose_desire',
      action: 'approach' },
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

type SeyeonC08LocalAdmissionInputsV1 = Readonly<{
  userMessageRef: string;
  userText: string;
  contextInput: RunSeyeonCharacterTurnV2Input['contextInput'];
  governance: RunSeyeonCharacterTurnV2Input['governance'];
  fullThreadCensus: SeyeonC08FullThreadIntegrityPortV1;
  /** Required only for an established relationship. Server-owned, DB-backed. */
  relationshipProofPort?: SeyeonC08PublicRelationshipProofPortV1;
}>;
async function requireSeyeonC08CurrentPublicAuthoritiesV1(
  input:SeyeonC08LocalAdmissionInputsV1,
  count:number,expectedTranscriptHash:string,
):Promise<void>{
  await requireSeyeonC08PublicThreadCensusV1(
    input.fullThreadCensus,input.userMessageRef,count,expectedTranscriptHash,
  );
  const relationship=input.contextInput.relationship;
  if(relationship!==null){
    try{
      await requireSeyeonC08PublicRelationshipProofV1({
        port:input.relationshipProofPort,
        subjectId:input.fullThreadCensus.subjectId,
        threadId:input.fullThreadCensus.threadId,
        currentUserMessageId:input.userMessageRef,
        expected:relationship,
      });
    }catch{
      throw new SeyeonC08LocalHoldV1('LOCAL_CONTEXT_NOT_PROVEN');
    }
  }
}
async function admitSeyeonC08LocalCandidateV1(input:SeyeonC08LocalAdmissionInputsV1){
  const expectedCount=assertLocalContext(input);
  const expectedTranscriptHash=hashSeyeonC08PublicTranscriptV1(
    input.contextInput.recentMessages,
  );
  const classified=classifySeyeonC08LocalEntryV1(input.userText);
  if(!classified)throw new SeyeonC08LocalHoldV1('LOCAL_INPUT_NOT_PROVEN');
  if(input.contextInput.relationship!==null &&
     (input.governance.relationship.trustBand!==
       input.contextInput.relationship.trustBand ||
      input.governance.relationship.relevantSharedHistoryRefs.length>0)){
    throw new SeyeonC08LocalHoldV1('LOCAL_CONTEXT_NOT_PROVEN');
  }
  await requireSeyeonC08CurrentPublicAuthoritiesV1(
    input,expectedCount,expectedTranscriptHash,
  );
  return {expectedCount,expectedTranscriptHash,classified};
}
/**
 * Optional read-only router precheck: the caller explicitly chooses whether
 * to invoke the original 3-call baseline, without trying one paid model first.
 * A SHADOW_CANDIDATE is *not* authority to route production traffic.
 */
export async function assessSeyeonC08LocalOneCallRouteV1(
  input:SeyeonC08LocalAdmissionInputsV1,
){
  try{
    const admissible=await admitSeyeonC08LocalCandidateV1(input);
    return Object.freeze({
      route:'ONE_CALL_SHADOW_CANDIDATE' as const,
      kind:admissible.classified.kind,
      productionRoutingAuthorized:false as const,
      automaticPaidFallbackAuthorized:false as const,
    });
  }catch(e){
    if(!(e instanceof SeyeonC08LocalHoldV1))throw e;
    return Object.freeze({
      route:'RETAIN_THREE_CALL_BASELINE' as const,
      reason:e.code,
      productionRoutingAuthorized:false as const,
      automaticPaidFallbackAuthorized:false as const,
    });
  }
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
  fullThreadCensus: SeyeonC08FullThreadIntegrityPortV1;
  relationshipProofPort?: SeyeonC08PublicRelationshipProofPortV1;
  dialogueProvider: SeyeonStructuredProviderPortV2;
  /** Offline reservation only; must reject when a conservative price cap cannot be checked. */
  reserveBeforeModel: (metadata: Readonly<{requestBytes:number; maxCompletionTokens:number}>) =>
    Readonly<{reservedMicroUsd:number; providerOutputTokenCapVerified:boolean}> |
    Promise<Readonly<{reservedMicroUsd:number; providerOutputTokenCapVerified:boolean}>>;
  maxCompletionTokens: number;
  /** Evaluation only. Baseline remains the default for fair shadow comparison. */
  promptProfile?: 'baseline' | 'compact_v1';
}>) {
  const {expectedCount,expectedTranscriptHash,classified}=
    await admitSeyeonC08LocalCandidateV1(input);

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
  if (context.behaviorPolicy.interactionDepth !== (
        context.relationship===null ? 'public_first_contact':'established_relationship') ||
      context.relationshipSemantics !== null ||
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
  const verboseRequest = Object.freeze({
    ...originalRequest,
    instructions: [
      originalRequest.instructions,
      'C08 restricted PUBLIC no-memory dialogue only: present-time conversation. A server-verified relationship stage is for present expression only; NEVER infer events, closeness claims, previous meetings, promises, historical intimacy or permission to disclose from that stage. No autobiographical or shared past, places, dates, relationship claims, private facts, personal-history guesses or user mind-reading. One to three short natural polite Korean sentences. Do not invent memory or suggest a relationship status.',
    ].join('\n'),
  });
  const request = input.promptProfile===undefined ||
    input.promptProfile==='baseline'
    ? verboseRequest
    : input.promptProfile==='compact_v1'
      ? compactSeyeonC08LocalRendererRequestV1(verboseRequest)
      : (()=>{throw new SeyeonC08LocalHoldV1('LOCAL_CONTEXT_NOT_PROVEN');})();
  await requireSeyeonC08CurrentPublicAuthoritiesV1(
    input,expectedCount,expectedTranscriptHash,
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
  let quote:Awaited<ReturnType<typeof input.reserveBeforeModel>>;
  try{
    quote=await input.reserveBeforeModel({
      requestBytes,maxCompletionTokens:input.maxCompletionTokens,
    });
  }catch{
    // The quote provider can be remote; never leak token, price route, or
    // underlying adapter exception to caller/logs.
    throw new SeyeonC08LocalHoldV1('LOCAL_BUDGET_UNVERIFIED');
  }
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
  await requireSeyeonC08CurrentPublicAuthoritiesV1(
    input,expectedCount,expectedTranscriptHash,
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
  await requireSeyeonC08CurrentPublicAuthoritiesV1(
    input,expectedCount,expectedTranscriptHash,
  );
  return Object.freeze({
    version:SEYEON_C08_LOCAL_ONE_CALL_VERSION_V1,
    scope:'SHADOW_ONLY_NOT_PRODUCTION' as const,
    verification:'LOCAL_RESTRICTED_NOT_SEMANTIC_PARITY' as const,
    llmCalls:1 as const,
    censusReads:4 as const,
    publicRelationshipAuthority:context.relationship===null
      ? 'NONE_FIRST_CONTACT' as const
      : 'VERIFIED_ESTABLISHED_RELATIONSHIP' as const,
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
