// Watchtower-Track: security
// S0 G0 -> G1: exact historical text window comparison before any model call.
// This produces NO persisted G1 Pin, paid-model or HTTP Reveal permission.
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../packages/domain/src/index.js';
import {assembleSeyeonRuntimeContextV2,selectSeyeonRuntimeRecentMessagesV2} from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import type {RunSeyeonCharacterTurnV2Input} from './seyeon-character-runtime-v2.js';
import type {SeyeonRecentMessageV2} from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import type {SeyeonProductionRecentMessageAuthorityRowV1} from './seyeon-production-context-read-v1.js';

export const SEYEON_G1_HISTORICAL_MODEL_WINDOW_CENSUS_V1 =
  'seyeon-g1-historical-model-window-census-v1' as const;

export class SeyeonG1HistoricalModelWindowHoldV1 extends Error {
  readonly code='SEYEON_G1_HISTORICAL_WINDOW_NOT_PINNED' as const;
  constructor() {
    super('Historical model-input window is not an exact DB-authorized original source set.');
    this.name='SeyeonG1HistoricalModelWindowHoldV1';
  }
}

function hash(value:unknown):string {
  return 'sha256:v1:'+createHash('sha256')
    .update(canonicalJson(value)).digest('hex');
}

/**
 * The G0 DB-owned recent-source reader has independently checked every
 * original historical User / Assistant, including the current Memory Grant
 * of any committed Assistant. Compare ALL selected rows, not a subset that
 * happens to match. The last User must be the exact DB-received live Turn.
 *
 * A successful comparison is only a candidate for a future G1 DB Owner Pin.
 * Until G1 persists the entire positive historical source set and G2/G3
 * recheck it, model dispatch remains unconditionally denied.
 */
export function buildSeyeonG1HistoricalModelWindowCensusV1(input:Readonly<{
  currentUserMessageId:string;
  currentUserText:string;
  maxRecentMessages:number;
  dbVerifiedWindow:readonly SeyeonProductionRecentMessageAuthorityRowV1[];
  exactModelRecentMessages:readonly SeyeonRecentMessageV2[];
}>):Readonly<{
  version:typeof SEYEON_G1_HISTORICAL_MODEL_WINDOW_CENSUS_V1;
  historicalSourceCount:number;
  selectedHistoricalModelSourceDigest:string;
  selectedCompleteModelWindowDigest:string;
  historicalSources:readonly Readonly<{messageId:string;role:'user'|'assistant';textDigest:string}>[];
  persistedBeforeModel:false;
  authorizesModel:false;
  permitsHttpReveal:false;
}> {
  try {
    const {dbVerifiedWindow:rows,exactModelRecentMessages:messages}=input;
    if(!Number.isSafeInteger(input.maxRecentMessages) ||
       input.maxRecentMessages<1 || input.maxRecentMessages>24 ||
       !Array.isArray(rows) || !Array.isArray(messages) ||
       rows.length<2 || rows.length>input.maxRecentMessages ||
       messages.length!==rows.length ||
       !input.currentUserMessageId || !input.currentUserText) {
      throw new SeyeonG1HistoricalModelWindowHoldV1();
    }
    const ids=new Set<string>();
    const historicalSources:Readonly<{messageId:string;role:'user'|'assistant';textDigest:string}>[]=[];
    let previousSequence=-1;
    for(let i=0;i<rows.length;i++){
      const row=rows[i],model=messages[i];
      if(!row||!model || typeof row.messageId!=='string' ||
         !Number.isSafeInteger(row.sequenceNo) || row.sequenceNo<=previousSequence ||
         ids.has(row.messageId) || row.messageId!==model.messageId ||
         typeof row.text!=='string' || row.text!==model.text ||
         (row.senderType!=='user'&&row.senderType!=='character') ||
         (row.senderType==='user'&&row.characterId!==null) ||
         (row.senderType==='character'&&row.characterId!=='seyeon')) {
        throw new SeyeonG1HistoricalModelWindowHoldV1();
      }
      const role=row.senderType==='user'?'user':'assistant';
      if(model.role!==role)throw new SeyeonG1HistoricalModelWindowHoldV1();
      if(i===rows.length-1){
        if(row.messageId!==input.currentUserMessageId ||
           row.senderType!=='user'||row.text!==input.currentUserText)
          throw new SeyeonG1HistoricalModelWindowHoldV1();
      } else {
        if(row.messageId===input.currentUserMessageId)
          throw new SeyeonG1HistoricalModelWindowHoldV1();
        historicalSources.push(Object.freeze({
          messageId:row.messageId,role,textDigest:'sha256:wire-utf8:v1:'+
            createHash('sha256').update(row.text,'utf8').digest('hex'),
        }));
      }
      ids.add(row.messageId);
      previousSequence=row.sequenceNo;
    }
    const exact=Object.freeze(messages.map(message=>Object.freeze({
      messageId:message.messageId,role:message.role,textDigest:hash(message.text),
    })));
    return Object.freeze({
      version:SEYEON_G1_HISTORICAL_MODEL_WINDOW_CENSUS_V1,
      historicalSourceCount:historicalSources.length,
      historicalSources:Object.freeze(historicalSources),
      selectedHistoricalModelSourceDigest:hash(historicalSources),
      selectedCompleteModelWindowDigest:hash(exact),
      persistedBeforeModel:false as const,
      authorizesModel:false as const,
      permitsHttpReveal:false as const,
    });
  } catch {
    throw new SeyeonG1HistoricalModelWindowHoldV1();
  }
}

/**
 * Seal the complete deterministic historical Interpreter context that WOULD
 * be assembled with no derived/Preflight additions. This is not an actual
 * Provider packet and cannot authorize a model, G2 Commit, or HTTP Reveal.
 * G1 must later compare the real post-Preflight packet to this digest before
 * any Provider invocation; G2 must recheck original rights atomically.
 */
export function buildSeyeonG1HistoricalFinalContextCandidateSealV1(input:Readonly<{
  contextInput:RunSeyeonCharacterTurnV2Input['contextInput'];
  currentUserMessageId:string;
  currentUserText:string;
  census:ReturnType<typeof buildSeyeonG1HistoricalModelWindowCensusV1>;
  originalMemory:Readonly<{recordId:string;grantId:string}>;
  selectedSourcesDigest:string;
  selectedModelSourceCensusDigest:string;
}>):Readonly<{
  preModelContextDigest:string;
  expectedFinalModelContextDigest:string;
}>{
  try{
    const c=input.contextInput;
    const selected=selectSeyeonRuntimeRecentMessagesV2({
      recentMessages:c.recentMessages,
      ...(c.maxRecentMessages===undefined?{}:{maxRecentMessages:c.maxRecentMessages}),
    });
    const memory=c?.retrievedMemories;
    const past=input.census;
    if(!c||c.relationship!==null||!Array.isArray(selected)
      ||selected.length<2||selected.length>24
      ||!Array.isArray(memory)||memory.length!==1
      ||!input.currentUserMessageId||!input.currentUserText
      ||!past||past.authorizesModel!==false
      ||past.persistedBeforeModel!==false||past.permitsHttpReveal!==false
      ||past.historicalSourceCount!==selected.length-1
      ||past.historicalSources.length!==selected.length-1
      ||selected[selected.length-1]?.messageId!==input.currentUserMessageId
      ||selected[selected.length-1]?.role!=='user'
      ||selected[selected.length-1]?.text!==input.currentUserText
      ||memory[0]?.kind!=='memory'
      ||memory[0]?.sourceRef!=='memory:'+input.originalMemory.recordId
        +':grant:'+input.originalMemory.grantId
      ||!/^sha256:v1:[a-f0-9]{64}$/u.test(input.selectedSourcesDigest)
      ||!/^sha256:v1:[a-f0-9]{64}$/u.test(input.selectedModelSourceCensusDigest))
      throw new SeyeonG1HistoricalModelWindowHoldV1();

    const exact=selected.map((m,i)=>{
      if(!m||!m.messageId||!m.text||!['user','assistant'].includes(m.role))
        throw new SeyeonG1HistoricalModelWindowHoldV1();
      if(i<selected.length-1){
        const h=past.historicalSources[i];
        if(!h||h.messageId!==m.messageId||h.role!==m.role
          ||h.textDigest!=='sha256:wire-utf8:v1:'+
             createHash('sha256').update(m.text,'utf8').digest('hex'))
          throw new SeyeonG1HistoricalModelWindowHoldV1();
      }
      return {messageId:m.messageId,role:m.role,textDigest:hash(m.text)};
    });
    if(hash(exact)!==past.selectedCompleteModelWindowDigest)
      throw new SeyeonG1HistoricalModelWindowHoldV1();

    const assembled=assembleSeyeonRuntimeContextV2({
      ...c,
      relationship:null,
      relationshipSemantics:null,
      integrityDecisions:[],
      governedPreflightApplied:true,
      disclosure:{decision:null,retrievedSources:[]},
    });
    if(canonicalJson(assembled.recentConversation)!==canonicalJson(selected)
      ||assembled.retrievedMemories.length!==1
      ||assembled.integrity.decisions.length!==0
      ||assembled.disclosure.retrievedSources.length!==0)
      throw new SeyeonG1HistoricalModelWindowHoldV1();

    return Object.freeze({
      preModelContextDigest:hash({
        contextInput:c,
        selectedModelSourceCensusDigest:input.selectedModelSourceCensusDigest,
        completeHistoryDigest:past.selectedCompleteModelWindowDigest,
      }),
      expectedFinalModelContextDigest:hash(assembled),
    });
  }catch{throw new SeyeonG1HistoricalModelWindowHoldV1();}
}
