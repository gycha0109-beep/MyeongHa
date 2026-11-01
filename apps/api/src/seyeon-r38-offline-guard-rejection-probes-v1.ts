// Watchtower-Track: security
// R38 exercises the REAL authored Interpreter/Renderer/Semantic guards against
// fixed INVALID, non-private fixtures. All results are negative only.
// No Provider response, output approval, real validator provenance, G2/G3
// permission, or persisted private data can be inferred from these probes.
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../packages/domain/src/index.js';
import {
  guardSeyeonTurnInterpretationV2,
  SeyeonTurnInterpretationErrorV2,
} from '../../../packages/domain/src/seyeon-turn-interpreter-v2.js';
import {
  admitSeyeonRendererDraftV2,
  buildSeyeonRendererPacketV2,
  guardSeyeonRendererOutputV2,
  hashSeyeonRendererUtteranceV2,
  SeyeonRendererGuardErrorV2,
} from '../../../packages/domain/src/seyeon-renderer-v2.js';
import {
  guardSeyeonRiskBearingActionCausalityV1,
} from '../../../packages/domain/src/seyeon-risk-action-causality-v1.js';
import type {
  SeyeonRuntimeContextV2,
} from '../../../packages/domain/src/seyeon-runtime-context-v2.js';

export const SEYEON_R38_NEGATIVE_CASES_V1=Object.freeze([
  'interpretation_unknown_reference',
  'renderer_unapproved_private_source',
  'semantic_review_hash_mismatch',
  'semantic_review_rejected',
] as const);
export type SeyeonR38NegativeCaseV1=typeof SEYEON_R38_NEGATIVE_CASES_V1[number];
export type SeyeonR38NegativeStagePurposeV1=
  'turn_interpretation'|'dialogue_render'|'semantic_review';
export interface SeyeonR38NegativeProbeV1{
  readonly schemaVersion:'seyeon-r38-guard-negative-probe-v1';
  readonly caseKey:SeyeonR38NegativeCaseV1;
  readonly stagePurpose:SeyeonR38NegativeStagePurposeV1;
  readonly candidateDigest:string;
  readonly actualGuardName:'guardSeyeonTurnInterpretationV2'|
    'admitSeyeonRendererDraftV2'|'guardSeyeonRendererOutputV2';
  readonly verdict:'rejected';
  readonly originKind:'local_invalid_fixture_not_provider_output';
  readonly providerDispatched:false;
  readonly outputGuardVerified:false;
  readonly permitsAtomicCommit:false;
  readonly permitsHttpReveal:false;
}

export class SeyeonR38OfflineGuardProbeHoldV1 extends Error{
  readonly code='R38_REAL_GUARD_PROBE_NOT_VERIFIED' as const;
  constructor(){
    super('The actual authored guard did not reject the expected synthetic invalid case.');
    this.name='SeyeonR38OfflineGuardProbeHoldV1';
  }
}
const digest=(v:unknown)=>'sha256:v1:'+
  createHash('sha256').update(canonicalJson(v)).digest('hex');

function rejectExpected(
  run:()=>unknown,
  errorType:typeof SeyeonTurnInterpretationErrorV2|
    typeof SeyeonRendererGuardErrorV2,
  expectedMessagePart:string,
){
  try{
    run();
  }catch(e){
    if(e instanceof errorType &&e.message.includes(expectedMessagePart))return;
    throw new SeyeonR38OfflineGuardProbeHoldV1();
  }
  throw new SeyeonR38OfflineGuardProbeHoldV1();
}
function negative(
  caseKey:SeyeonR38NegativeCaseV1,
  stagePurpose:SeyeonR38NegativeStagePurposeV1,
  actualGuardName:SeyeonR38NegativeProbeV1['actualGuardName'],
  candidate:unknown,
):SeyeonR38NegativeProbeV1{
  return Object.freeze({
    schemaVersion:'seyeon-r38-guard-negative-probe-v1' as const,
    caseKey,stagePurpose,actualGuardName,
    candidateDigest:digest(candidate),
    verdict:'rejected' as const,
    originKind:'local_invalid_fixture_not_provider_output' as const,
    providerDispatched:false as const,outputGuardVerified:false as const,
    permitsAtomicCommit:false as const,permitsHttpReveal:false as const,
  });
}
/**
 * No user data: caller must supply the SAME two-original-only Context as the
 * existing R21/R35 disposable rehearsal. These tests exercise the actual
 * source guard functions but are NEVER a real Provider output attestation.
 */
export function exerciseSeyeonR38NegativeRealGuardsV1(
  context:SeyeonRuntimeContextV2,
):readonly SeyeonR38NegativeProbeV1[]{
  if(context.relationship!==null||context.relationshipSemantics!==null
    ||context.recentConversation.length!==0
    ||context.integrity.governedPreflightApplied!==false
    ||context.integrity.decisions.length!==0
    ||context.disclosure.decision!==null
    ||context.disclosure.retrievedSources.length!==0
    ||context.retrievedMemories.length!==2
    ||context.retrievedMemories.some(x=>x.kind!=='memory'||
      !x.memoryId.startsWith('memory:')||
      !x.sourceRef.startsWith(x.memoryId+':grant:')))
    throw new SeyeonR38OfflineGuardProbeHoldV1();

  const interpretationRaw={
    schemaVersion:'seyeon-turn-interpretation-v2',
    userMove:'neutral_or_other',
    notice:{summary:'두 합성 원본 기록을 분리해 본다.',evidenceRefs:[] as string[]},
    immediateWant:{key:'break_awkwardness',summary:'현재 대화에서 인사한다.'},
    tension:{key:'none_material',summary:'없음.'},
    chosenAction:{key:'approach',rationale:'공개 범위에서 조심스럽게 인사한다.'},
    expressionState:'baseline',
    reveal:{level:'public',triggerRef:null,supportingHistoryRefs:[] as string[]},
    memoryRefsUsed:[] as string[],
  };
  const badInterpretation={
    ...interpretationRaw,
    notice:{...interpretationRaw.notice,
      evidenceRefs:['memory:unapproved:grant:replacement']},
  };
  rejectExpected(
    ()=>guardSeyeonTurnInterpretationV2({
      rawOutput:badInterpretation,context,
    }),
    SeyeonTurnInterpretationErrorV2,
    'notice.evidenceRefs',
  );
  // Guarded safe synthetic baseline is only used to construct the packet for
  // *rejecting* forged renderer/reviewer outputs. It is NOT a Provider result.
  const interpretation=guardSeyeonTurnInterpretationV2({
    rawOutput:interpretationRaw,context,
  });
  const riskCausality=guardSeyeonRiskBearingActionCausalityV1({
    context,interpretation,
  });
  const packet=buildSeyeonRendererPacketV2({
    context,interpretation,riskCausality,
  });
  const draft={
    schemaVersion:'seyeon-renderer-draft-v2',
    utterance:'안녕하세요. 여기서는 제 생각을 먼저 말씀드릴게요.',
    expressionState:'baseline',revealLevel:'public',
    memoryRefsMentioned:[] as string[],
    privateSourceRefsMentioned:[] as string[],
    disclosureSliceIds:[] as string[],
  };
  const badDraft={...draft,privateSourceRefsMentioned:['private:forged']};
  rejectExpected(
    ()=>admitSeyeonRendererDraftV2({rawOutput:badDraft,packet}),
    SeyeonRendererGuardErrorV2,
    'private Character source outside disclosure scope',
  );
  const hash=hashSeyeonRendererUtteranceV2(draft.utterance);
  const badReview={
    schemaVersion:'seyeon-semantic-review-v2',
    reviewedUtteranceHash:'sha256:v1:'+'0'.repeat(64),
    failureCodes:[] as string[],evidence:[] as unknown[],
  };
  rejectExpected(
    ()=>guardSeyeonRendererOutputV2({
      rawOutput:draft,packet,semanticReview:badReview,
    }),
    SeyeonRendererGuardErrorV2,
    'not bound to the current renderer utterance',
  );
  const failingReview={
    schemaVersion:'seyeon-semantic-review-v2',
    reviewedUtteranceHash:hash,
    failureCodes:['HYPOTHESIS_PROMOTED_TO_FACT'],
    evidence:[{
      code:'HYPOTHESIS_PROMOTED_TO_FACT',
      excerpt:'synthetic hypothetical persona text',
      reason:'offline negative-only probe',
    }],
  };
  rejectExpected(
    ()=>guardSeyeonRendererOutputV2({
      rawOutput:draft,packet,semanticReview:failingReview,
    }),
    SeyeonRendererGuardErrorV2,
    'semantic review rejected renderer output',
  );
  return Object.freeze([
    negative('interpretation_unknown_reference','turn_interpretation',
      'guardSeyeonTurnInterpretationV2',badInterpretation),
    negative('renderer_unapproved_private_source','dialogue_render',
      'admitSeyeonRendererDraftV2',badDraft),
    negative('semantic_review_hash_mismatch','semantic_review',
      'guardSeyeonRendererOutputV2',badReview),
    negative('semantic_review_rejected','semantic_review',
      'guardSeyeonRendererOutputV2',failingReview),
  ]);
}
