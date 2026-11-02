// Watchtower-Track: security
// S0 G0 -> G1: exact historical text window comparison before any model call.
// This produces NO persisted G1 Pin, paid-model or HTTP Reveal permission.
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../packages/domain/src/index.js';
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
          messageId:row.messageId,role,textDigest:hash(row.text),
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
