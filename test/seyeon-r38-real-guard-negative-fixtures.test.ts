// Watchtower-Track: security
// Runs in the ordinary offline Vitest suite, without PostgreSQL or Provider.
import {describe,expect,it} from 'vitest';
import {
  assembleSeyeonRuntimeContextV2,
} from '../packages/domain/src/seyeon-runtime-context-v2.js';
import {
  exerciseSeyeonR38NegativeRealGuardsV1,
  SeyeonR38OfflineGuardProbeHoldV1,
} from '../apps/api/src/seyeon-r38-offline-guard-rejection-probes-v1.js';

function context(){
  return assembleSeyeonRuntimeContextV2({
    relationship:null,relationshipSemantics:null,
    recentMessages:[],integrityDecisions:[],
    governedPreflightApplied:false,
    retrievedMemories:[
      {
        kind:'memory' as const,
        memoryId:'memory:d5000000-0000-4000-8000-000000000091',
        claimKind:'fact' as const,
        summary:'synthetic model projection 0',
        sourceRef:
          'memory:d5000000-0000-4000-8000-000000000091:grant:d6000000-0000-4000-8000-000000000091',
        relevance:0.9,salience:0.8,
      },
      {
        kind:'memory' as const,
        memoryId:'memory:d5000000-0000-4000-8000-000000000092',
        claimKind:'fact' as const,
        summary:'synthetic model projection 1',
        sourceRef:
          'memory:d5000000-0000-4000-8000-000000000092:grant:d6000000-0000-4000-8000-000000000092',
        relevance:0.8,salience:0.8,
      },
    ],
    disclosure:{decision:null,retrievedSources:[]},
  });
}
describe('R38 real Se-yeon authored output guards / invalid offline only',()=>{
  it('executes four actual guard rejection branches, never granting output authority',()=>{
    const value=exerciseSeyeonR38NegativeRealGuardsV1(context());
    expect(value.map(p=>p.caseKey)).toEqual([
      'interpretation_unknown_reference',
      'renderer_unapproved_private_source',
      'semantic_review_hash_mismatch',
      'semantic_review_rejected',
    ]);
    expect(value.map(p=>p.stagePurpose)).toEqual([
      'turn_interpretation','dialogue_render',
      'semantic_review','semantic_review',
    ]);
    expect(value.map(p=>p.actualGuardName)).toEqual([
      'guardSeyeonTurnInterpretationV2',
      'admitSeyeonRendererDraftV2',
      'guardSeyeonRendererOutputV2',
      'guardSeyeonRendererOutputV2',
    ]);
    expect(new Set(value.map(p=>p.candidateDigest)).size).toBe(4);
    for(const item of value){
      expect(item).toMatchObject({
        schemaVersion:'seyeon-r38-guard-negative-probe-v1',
        verdict:'rejected',
        originKind:'local_invalid_fixture_not_provider_output',
        providerDispatched:false,outputGuardVerified:false,
        permitsAtomicCommit:false,permitsHttpReveal:false,
      });
      expect(item.candidateDigest).toMatch(/^sha256:v1:[0-9a-f]{64}$/u);
    }
  });
  it('refuses derived conversation history as a negative probe source',()=>{
    const original=context();
    const changed={
      ...original,
      recentConversation:[{
        messageId:'synthetic:unapproved-history',
        role:'assistant' as const,text:'not an authorized original memory',
      }],
    };
    expect(()=>exerciseSeyeonR38NegativeRealGuardsV1(changed))
      .toThrow(SeyeonR38OfflineGuardProbeHoldV1);
  });
  it('refuses replacement/forged original-Grant sourceRefs',()=>{
    const original=context();
    const changed={
      ...original,retrievedMemories:[
        original.retrievedMemories[0]!,
        {...original.retrievedMemories[1]!,
          sourceRef:'memory:unapproved:grant:replacement'},
      ],
    };
    expect(()=>exerciseSeyeonR38NegativeRealGuardsV1(changed))
      .toThrow(SeyeonR38OfflineGuardProbeHoldV1);
  });
});
