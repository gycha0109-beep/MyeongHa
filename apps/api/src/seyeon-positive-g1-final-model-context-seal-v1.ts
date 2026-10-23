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
import {selectSeyeonExactModelPersonalSourcesV1} from './seyeon-exact-model-personal-source-selection-v1.js';

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

/**
 * A G1 Pin currently covers pre-Preflight input + one exact original Memory.
 * It does not sign arbitrary Preflight integrity claims, relationship
 * overlays, disclosure retrieval or modified Bible/policy fields. The final
 * assembled Interpreter input must equal the deterministic assembly of
 * precisely that pinned input under zero added sources. This rejects newly
 * assembled derived context BEFORE the first Provider request; G0/DB Owner
 * approval remains a separate requirement.
 */
export function assertSeyeonPositiveG1FinalModelContextSealV1(input:Readonly<{
  pinnedContextInput:RunSeyeonCharacterTurnV2Input['contextInput'];
  pinnedContextInputDigest:string;
  selectedSourcesDigest:string;
  sourceCandidates:readonly SeyeonPersonalRecordProjectionCandidateV1[];
  assembledContext:SeyeonRuntimeContextV2;
}>):void {
  try {
    if(digest(input.pinnedContextInput)!==input.pinnedContextInputDigest ||
       input.pinnedContextInput.relationship!==null ||
       !Array.isArray(input.pinnedContextInput.recentMessages) ||
       input.pinnedContextInput.recentMessages.length!==0) {
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
       expected.recentConversation.length!==0 ||
       expected.integrity.decisions.length!==0 ||
       expected.disclosure.retrievedSources.length!==0) {
      throw new SeyeonPositiveG1FinalModelContextHoldV1();
    }
    const actual=selectSeyeonExactModelPersonalSourcesV1({
      retrievedMemories:input.assembledContext.retrievedMemories,
      sourceCandidates:input.sourceCandidates,
    });
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
