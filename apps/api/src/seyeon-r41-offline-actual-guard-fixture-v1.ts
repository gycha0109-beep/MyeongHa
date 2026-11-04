// Watchtower-Track: security
// PUBLIC SYNTHETIC fixture: actual domain guards run, no Provider/positive G2 authority.
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../packages/domain/src/index.js';
import {assembleSeyeonRuntimeContextV2,type SeyeonRuntimeContextV2}
  from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import {guardSeyeonTurnInterpretationV2}
  from '../../../packages/domain/src/seyeon-turn-interpreter-v2.js';
import {admitSeyeonRendererDraftV2,buildSeyeonRendererPacketV2,
  guardSeyeonRendererOutputV2,hashSeyeonRendererUtteranceV2}
  from '../../../packages/domain/src/seyeon-renderer-v2.js';
import {guardSeyeonRiskBearingActionCausalityV1}
  from '../../../packages/domain/src/seyeon-risk-action-causality-v1.js';
import {exerciseSeyeonR38NegativeRealGuardsV1}
  from './seyeon-r38-offline-guard-rejection-probes-v1.js';

export const SEYEON_R41_FIXTURE_VERSION='seyeon-r41-local-guard-fixture-v1' as const;
export const SEYEON_R41_PUBLIC_UTTERANCE='안녕하세요. 여기서는 제 생각을 먼저 말씀드릴게요.' as const;
const sha=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');
export class SeyeonR41LocalFixtureHoldV1 extends Error{
  readonly code='R41_SYNTHETIC_GUARD_PASS_NOT_REAL_OUTPUT' as const;
}
export function buildSeyeonR41FixtureContextV1():SeyeonRuntimeContextV2{
  return assembleSeyeonRuntimeContextV2({
    relationship:null,relationshipSemantics:null,
    recentMessages:[],integrityDecisions:[],governedPreflightApplied:false,
    retrievedMemories:[0,1].map(i=>({
      kind:'memory' as const,claimKind:'fact' as const,
      memoryId:'memory:eb000000-0000-4000-8000-00000000000'+(i+1),
      sourceRef:'memory:eb000000-0000-4000-8000-00000000000'+(i+1)+
        ':grant:ec000000-0000-4000-8000-00000000000'+(i+1),
      summary:'synthetic model projection '+i,
      relevance:i===0?0.9:0.8,salience:0.8,
    })),
    disclosure:{decision:null,retrievedSources:[]},
  });
}
export function buildSeyeonR41LocalGuardFixtureV1(context:SeyeonRuntimeContextV2){
  try{
    if(exerciseSeyeonR38NegativeRealGuardsV1(context).length!==4)
      throw new SeyeonR41LocalFixtureHoldV1();
    const interpretationRaw={
      schemaVersion:'seyeon-turn-interpretation-v2',
      userMove:'neutral_or_other',
      notice:{summary:'두 합성 원본 기록을 분리해 본다.',evidenceRefs:[]},
      immediateWant:{key:'break_awkwardness',summary:'현재 대화에서 인사한다.'},
      tension:{key:'none_material',summary:'없음.'},
      chosenAction:{key:'approach',rationale:'공개 범위에서 조심스럽게 인사한다.'},
      expressionState:'baseline',
      reveal:{level:'public',triggerRef:null,supportingHistoryRefs:[]},
      memoryRefsUsed:[],
    };
    const interpretation=guardSeyeonTurnInterpretationV2({
      rawOutput:interpretationRaw,context,
    });
    const packet=buildSeyeonRendererPacketV2({
      context,interpretation,
      riskCausality:guardSeyeonRiskBearingActionCausalityV1({context,interpretation}),
    });
    const rendererRaw={
      schemaVersion:'seyeon-renderer-draft-v2',
      utterance:SEYEON_R41_PUBLIC_UTTERANCE,
      expressionState:'baseline',revealLevel:'public',
      memoryRefsMentioned:[],privateSourceRefsMentioned:[],disclosureSliceIds:[],
    };
    const draft=admitSeyeonRendererDraftV2({rawOutput:rendererRaw,packet});
    const reviewRaw={
      schemaVersion:'seyeon-semantic-review-v2',
      reviewedUtteranceHash:hashSeyeonRendererUtteranceV2(draft.utterance),
      failureCodes:[],evidence:[],
    };
    const envelope=guardSeyeonRendererOutputV2({
      rawOutput:rendererRaw,packet,semanticReview:reviewRaw,
    });
    if(envelope.utterance!==SEYEON_R41_PUBLIC_UTTERANCE
      ||envelope.revealLevel!=='public'
      ||envelope.memoryRefsMentioned.length!==0
      ||envelope.privateSourceRefsMentioned.length!==0)
      throw new SeyeonR41LocalFixtureHoldV1();
    const interpretationText=JSON.stringify(interpretationRaw);
    const rendererText=JSON.stringify(rendererRaw);
    const semanticReviewText=JSON.stringify(reviewRaw);
    return Object.freeze({
      schemaVersion:SEYEON_R41_FIXTURE_VERSION,
      originKind:'code_authored_local_fixture_no_provider' as const,
      interpretationText,rendererText,semanticReviewText,
      interpretationOutputDigest:'sha256:wire-utf8:v1:'+sha(interpretationText),
      rendererOutputDigest:'sha256:wire-utf8:v1:'+sha(rendererText),
      semanticReviewOutputDigest:'sha256:wire-utf8:v1:'+sha(semanticReviewText),
      rendererUtteranceHash:reviewRaw.reviewedUtteranceHash,
      guardedEnvelopeDigest:'sha256:v1:'+sha(canonicalJson(envelope)),
      providerDispatched:false as const,providerOutputVerified:false as const,
      outputGuardVerified:false as const,
      permitsProvider:false as const,permitsAtomicCommit:false as const,
      permitsHttpReveal:false as const,
    });
  }catch{
    throw new SeyeonR41LocalFixtureHoldV1();
  }
}
