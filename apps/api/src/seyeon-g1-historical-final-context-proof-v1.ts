// Watchtower-Track: security
// Isolated G1 historical candidate -> actual post-Preflight Interpreter context.
// This comparison is NOT a model admission, G2 Commit, or G3 Reveal grant.
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../packages/domain/src/index.js';
import {
  assembleSeyeonRuntimeContextV2,
  selectSeyeonRuntimeRecentMessagesV2,
  type SeyeonRuntimeContextV2,
} from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import type {RunSeyeonCharacterTurnV2Input} from './seyeon-character-runtime-v2.js';
import type {SeyeonPersonalRecordProjectionCandidateV1} from './seyeon-production-context-v1.js';
import {
  selectSeyeonExactModelPersonalSourcesV1,
} from './seyeon-exact-model-personal-source-selection-v1.js';
import {
  buildSeyeonG1HistoricalFinalContextCandidateSealV1,
  type buildSeyeonG1HistoricalModelWindowCensusV1,
} from './seyeon-g1-historical-model-window-census-v1.js';

type HistoricalCensus = ReturnType<typeof buildSeyeonG1HistoricalModelWindowCensusV1>;
const hash=(value:unknown)=>'sha256:v1:'+
  createHash('sha256').update(canonicalJson(value)).digest('hex');

export class SeyeonG1HistoricalPostPreflightContextHoldV1 extends Error {
  readonly code='SEYEON_HISTORICAL_POST_PREFLIGHT_CONTEXT_HOLD' as const;
  constructor(){
    super('Historical model Context is not confined to the immutable original-source candidate.');
    this.name='SeyeonG1HistoricalPostPreflightContextHoldV1';
  }
}

/**
 * The G1 v4 owner receipt is intentionally a non-authorizing candidate.
 * Even an exact equality here NEVER opens Provider dispatch. G2 and G3
 * must independently implement same-transaction rights and Reveal checks.
 */
export function assertSeyeonG1HistoricalPostPreflightContextCandidateV1(input:Readonly<{
  pinnedContextInput:RunSeyeonCharacterTurnV2Input['contextInput'];
  currentUserMessageId:string;
  currentUserText:string;
  sourceCandidates:readonly SeyeonPersonalRecordProjectionCandidateV1[];
  census:HistoricalCensus;
  persistedHistoricalCandidateProof:Readonly<Record<string,unknown>>;
  assembledContext:SeyeonRuntimeContextV2;
}>):void{
  try{
    const p=input.persistedHistoricalCandidateProof;
    const c=input.pinnedContextInput;
    const census=input.census;
    if(!p||p.schemaVersion!=='seyeon-g1-historical-source-candidate-v4'
      ||p.authorizesModel!==false||p.permitsAtomicCommit!==false
      ||p.permitsHttpReveal!==false||p.characterId!=='seyeon'
      ||p.currentUserMessageId!==input.currentUserMessageId
      ||p.currentUserTextDigest!=='sha256:wire-utf8:v1:'+
          createHash('sha256').update(input.currentUserText,'utf8').digest('hex')
      ||p.historicalSourceCount!==census.historicalSourceCount
      ||canonicalJson(p.historicalSources)!==canonicalJson(census.historicalSources)
      ||p.recordKind!=='memory'
      ||typeof p.recordId!=='string'||typeof p.originalGrantId!=='string'
      ||typeof p.expectedFinalModelContextDigest!=='string'
      ||typeof p.preModelContextDigest!=='string')
      throw new SeyeonG1HistoricalPostPreflightContextHoldV1();

    // Recreate the EXACT retrieval and recent-window census that the runtime
    // normalizer will use, never trust digest strings supplied by a caller.
    const selection=selectSeyeonExactModelPersonalSourcesV1({
      retrievedMemories:c.retrievedMemories,
      ...(c.maxRetrievedMemories===undefined?{}:{maxRetrievedMemories:c.maxRetrievedMemories}),
      recentMessages:c.recentMessages,
      ...(c.maxRecentMessages===undefined?{}:{maxRecentMessages:c.maxRecentMessages}),
      currentUserMessageId:input.currentUserMessageId,
      sourceCandidates:input.sourceCandidates,
    });
    const original=selection.selectedSources[0];
    const recent=selectSeyeonRuntimeRecentMessagesV2({
      recentMessages:c.recentMessages,
      ...(c.maxRecentMessages===undefined?{}:{maxRecentMessages:c.maxRecentMessages}),
    });
    if(!original||original.recordKind!=='memory'
      ||selection.selectedPersonalRecordCount!==1
      ||selection.selectedMemoryCount!==1
      ||selection.selectedSources.length!==1
      ||selection.selectedUnpinnedDerivedSources.length!==0
      ||selection.selectedUnpinnedRecentSources.length!==census.historicalSourceCount
      ||recent.length!==census.historicalSourceCount+1
      ||selection.selectedCurrentUserSource?.messageId!==input.currentUserMessageId
      ||selection.selectedCurrentUserSource?.selectedModelMessageDigest!==hash(recent[recent.length-1])
      ||selection.selectedSourcesDigest!==hash(selection.selectedSources)
      ||selection.selectedModelSourceCensusDigest!==hash({
        originalPersonalSources:selection.selectedSources,
        currentUserSource:selection.selectedCurrentUserSource,
        unpinnedRecentSources:selection.selectedUnpinnedRecentSources,
        unpinnedDerivedSources:selection.selectedUnpinnedDerivedSources,
      })
      ||p.recordId!==original.recordId
      ||p.originalGrantId!==original.grantId
      ||p.recordType!==original.recordType
      ||p.recordSchemaVersion!==original.schemaVersion
      ||p.projectorVersion!==original.projectorVersion
      ||p.originalPgJsonbDigest!==original.rawRecordPgDigest
      ||p.selectedSourcesDigest!==selection.selectedSourcesDigest
      ||p.projectedMemoryDigest!==original.projectedMemoryDigest)
      throw new SeyeonG1HistoricalPostPreflightContextHoldV1();

    for(let i=0;i<census.historicalSourceCount;i++){
      const m=recent[i], origin=census.historicalSources[i];
      const selected=selection.selectedUnpinnedRecentSources[i];
      if(!m||!origin||!selected
        ||selected.messageId!==origin.messageId||selected.role!==origin.role
        ||selected.selectedModelMessageDigest!==hash(m)
        ||m.messageId!==origin.messageId||m.role!==origin.role
        ||origin.textDigest!=='sha256:wire-utf8:v1:'+
          createHash('sha256').update(m.text,'utf8').digest('hex'))
        throw new SeyeonG1HistoricalPostPreflightContextHoldV1();
    }

    const seal=buildSeyeonG1HistoricalFinalContextCandidateSealV1({
      contextInput:c,
      currentUserMessageId:input.currentUserMessageId,
      currentUserText:input.currentUserText,
      census,
      originalMemory:{recordId:original.recordId,grantId:original.grantId},
      selectedSourcesDigest:selection.selectedSourcesDigest,
      selectedModelSourceCensusDigest:selection.selectedModelSourceCensusDigest,
    });
    if(p.preModelContextDigest!==seal.preModelContextDigest
      ||p.expectedFinalModelContextDigest!==seal.expectedFinalModelContextDigest)
      throw new SeyeonG1HistoricalPostPreflightContextHoldV1();

    const expected=assembleSeyeonRuntimeContextV2({
      ...c, relationship:null,relationshipSemantics:null,
      integrityDecisions:[],governedPreflightApplied:true,
      disclosure:{decision:null,retrievedSources:[]},
    });
    if(hash(input.assembledContext)!==p.expectedFinalModelContextDigest
      ||canonicalJson(input.assembledContext)!==canonicalJson(expected)
      ||expected.recentConversation.length!==recent.length
      ||expected.retrievedMemories.length!==1
      ||expected.integrity.decisions.length!==0
      ||expected.disclosure.retrievedSources.length!==0)
      throw new SeyeonG1HistoricalPostPreflightContextHoldV1();
  }catch{
    throw new SeyeonG1HistoricalPostPreflightContextHoldV1();
  }
}
