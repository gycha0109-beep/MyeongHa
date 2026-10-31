// Watchtower-Track: security
// G1 -> Provider: exact final Se-yeon model-input closure for one positive
// original Memory. No DB ownership, approval or reveal capability.
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../packages/domain/src/index.js';
import {
  assembleSeyeonRuntimeContextV2,
  type SeyeonRuntimeContextV2,
} from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import type {RunSeyeonCharacterTurnV2Input} from './seyeon-character-runtime-v2.js';
import type {SeyeonPersonalRecordProjectionCandidateV1} from './seyeon-production-context-v1.js';
import {
  selectSeyeonExactModelPersonalSourcesV1,
  type SeyeonExactModelPersonalSourceSelectionV1,
} from './seyeon-exact-model-personal-source-selection-v1.js';

export class SeyeonPositiveG1FinalModelContextHoldV1 extends Error {
  readonly code='SEYEON_POSITIVE_G1_FINAL_CONTEXT_NOT_PINNED' as const;
  constructor() {
    super('Final model Context is not confined to its original G1 source Pin.');
    this.name='SeyeonPositiveG1FinalModelContextHoldV1';
  }
}

function digest(value:unknown):string {
  return 'sha256:v1:'+createHash('sha256')
    .update(canonicalJson(value)).digest('hex');
}

export const SEYEON_POSITIVE_G1_PRE_MODEL_SOURCE_CENSUS_SEAL_VERSION_V1 =
  'seyeon-positive-g1-pre-model-source-census-seal-v1' as const;

/** Digest persisted by the existing G1 owner Pin BEFORE any model call.
 * Covers the exact selected original source AND the entire pre-Preflight
 * context input, including the DB-current User message. This is not a
 * cryptographic authorization signature and never admits derived sources.
 */
export function buildSeyeonPositiveG1PreModelSourceCensusSealV1(input:Readonly<{
  pinnedContextInput:RunSeyeonCharacterTurnV2Input['contextInput'];
  selected:SeyeonExactModelPersonalSourceSelectionV1;
  currentUserMessageRef:string;
  currentUserText:string;
}>):Readonly<{
  pinnedContextInputDigest:string;
  selectedModelSourceCensusDigest:string;
  finalModelContextDigest:string;
}> {
  try {
    const {pinnedContextInput:context,selected}=input;
    const source=selected.selectedSources[0];
    if(!input.currentUserMessageRef||!input.currentUserText||
       context.relationship!==null ||
       context.recentMessages?.length!==1 ||
       context.recentMessages[0]?.role!=='user' ||
       context.recentMessages[0]?.messageId!==input.currentUserMessageRef ||
       context.recentMessages[0]?.text!==input.currentUserText ||
       context.retrievedMemories?.length!==1 ||
       context.retrievedMemories[0]?.kind!=='memory' ||
       !source||source.recordKind!=='memory' ||
       context.retrievedMemories[0].sourceRef!==
         'memory:'+source.recordId+':grant:'+source.grantId ||
       selected.selectedMemoryCount!==1 ||
       selected.selectedPersonalRecordCount!==1 ||
       selected.selectedSources.length!==1 ||
       selected.selectedUnpinnedDerivedSources.length!==0 ||
       selected.selectedSourcesDigest!==digest(selected.selectedSources) ||
       selected.selectedModelSourceCensusDigest!==digest({
         originalPersonalSources:selected.selectedSources,
         unpinnedDerivedSources:selected.selectedUnpinnedDerivedSources,
       })) {
      throw new SeyeonPositiveG1FinalModelContextHoldV1();
    }
    const pinnedContextInputDigest=digest(context);
    return Object.freeze({
      pinnedContextInputDigest,
      selectedModelSourceCensusDigest:selected.selectedModelSourceCensusDigest,
      finalModelContextDigest:digest({
        schemaVersion:SEYEON_POSITIVE_G1_PRE_MODEL_SOURCE_CENSUS_SEAL_VERSION_V1,
        pinnedContextInputDigest,
        selectedSourcesDigest:selected.selectedSourcesDigest,
        selectedModelSourceCensusDigest:selected.selectedModelSourceCensusDigest,
        currentUserMessageRef:input.currentUserMessageRef,
        currentUserTextDigest:digest(input.currentUserText),
      }),
    });
  } catch {
    throw new SeyeonPositiveG1FinalModelContextHoldV1();
  }
}

/**
 * A G1 Pin currently covers pre-Preflight input + one exact original Memory.
 * It does not sign arbitrary Preflight integrity claims, relationship
 * overlays, disclosure retrieval or modified Bible/policy fields. The final
 * assembled Interpreter input must equal the deterministic assembly of
 * precisely that pinned input, including the exact DB-owned current User
 * message, under zero added historical sources. This rejects newly assembled
 * derived context BEFORE Interpreter dispatch; G0/DB Owner approval remains
 * a separate requirement. Public-only Preflight runs before this seal.
 */
export function assertSeyeonPositiveG1FinalModelContextSealV1(input:Readonly<{
  pinnedContextInput:RunSeyeonCharacterTurnV2Input['contextInput'];
  pinnedContextInputDigest:string;
  pinnedFinalModelContextDigest:string;
  selectedModelSourceCensusDigest:string;
  selectedSourcesDigest:string;
  sourceCandidates:readonly SeyeonPersonalRecordProjectionCandidateV1[];
  currentUserMessageRef:string;
  currentUserText:string;
  assembledContext:SeyeonRuntimeContextV2;
}>):void {
  try {
    if(digest(input.pinnedContextInput)!==input.pinnedContextInputDigest ||
       input.pinnedContextInput.relationship!==null ||
       !Array.isArray(input.pinnedContextInput.recentMessages) ||
       input.pinnedContextInput.recentMessages.length!==1 ||
       !input.currentUserMessageRef || !input.currentUserText ||
       input.pinnedContextInput.recentMessages[0]?.role!=='user' ||
       input.pinnedContextInput.recentMessages[0]?.messageId!==input.currentUserMessageRef ||
       input.pinnedContextInput.recentMessages[0]?.text!==input.currentUserText) {
      throw new SeyeonPositiveG1FinalModelContextHoldV1();
    }
    const expected=assembleSeyeonRuntimeContextV2({
      ...input.pinnedContextInput,
      relationship:null,
      relationshipSemantics:null,
      integrityDecisions:[],
      governedPreflightApplied:true,
      disclosure:{decision:null,retrievedSources:[]},
    });
    if(canonicalJson(input.assembledContext)!==canonicalJson(expected) ||
       expected.retrievedMemories.length!==1 ||
       expected.recentConversation.length!==1 ||
       expected.integrity.decisions.length!==0 ||
       expected.disclosure.retrievedSources.length!==0) {
      throw new SeyeonPositiveG1FinalModelContextHoldV1();
    }
    const actual=selectSeyeonExactModelPersonalSourcesV1({
      retrievedMemories:input.assembledContext.retrievedMemories,
      sourceCandidates:input.sourceCandidates,
    });
    const persisted=buildSeyeonPositiveG1PreModelSourceCensusSealV1({
      pinnedContextInput:input.pinnedContextInput,
      selected:actual,
      currentUserMessageRef:input.currentUserMessageRef,
      currentUserText:input.currentUserText,
    });
    if(persisted.pinnedContextInputDigest!==input.pinnedContextInputDigest ||
       persisted.selectedModelSourceCensusDigest!==input.selectedModelSourceCensusDigest ||
       persisted.finalModelContextDigest!==input.pinnedFinalModelContextDigest) {
      throw new SeyeonPositiveG1FinalModelContextHoldV1();
    }
    if(actual.selectedMemoryCount!==1 ||
       actual.selectedPersonalRecordCount!==1 ||
       actual.selectedSources.length!==1 ||
       actual.selectedSources[0]?.recordKind!=='memory' ||
       actual.selectedSourcesDigest!==input.selectedSourcesDigest) {
      throw new SeyeonPositiveG1FinalModelContextHoldV1();
    }
  } catch {
    throw new SeyeonPositiveG1FinalModelContextHoldV1();
  }
}
