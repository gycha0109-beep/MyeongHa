// Watchtower-Track: security
// R21 remains offline/disposable: this is negative model-input admission only.
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {canonicalJson} from '../packages/domain/src/index.js';
import type {SeyeonRetrievedMemoryV2} from '../packages/domain/src/seyeon-runtime-context-v2.js';
import {
  SEYEON_PRODUCTION_CONTEXT_VERSION_V1,
  type SeyeonPersonalRecordProjectionCandidateV1,
} from '../apps/api/src/seyeon-production-context-v1.js';
import {
  SEYEON_R21_OFFLINE_DERIVED_SOURCE_CLOSURE_V1,
  assertSeyeonR21OfflineDerivedSourceClosureV1,
  SeyeonR21DerivedSourceClosureHoldV1,
  type SeyeonR21OfflineDerivedSourceEnvelopeV1,
} from '../apps/api/src/seyeon-r21-offline-derived-source-closure-v1.js';

const hash=(v:unknown)=>'sha256:v1:'+
  createHash('sha256').update(canonicalJson(v)).digest('hex');
const origins=[
  ['11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333'],
  ['22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444'],
] as const;
const memories:readonly SeyeonRetrievedMemoryV2[]=origins.map(([recordId,grantId],i)=>({
  kind:'memory',memoryId:'memory:'+recordId,
  sourceRef:'memory:'+recordId+':grant:'+grantId,
  claimKind:'fact',summary:'Synthetic original '+i,relevance:0.8-i*0.1,salience:0.5,
}));
const candidates:readonly SeyeonPersonalRecordProjectionCandidateV1[]=memories.map((m,i)=>({
  recordKind:'memory',recordId:origins[i]![0],grantId:origins[i]![1],
  recordType:'shared_detail',schemaVersion:'memory-v1',
  projectedMemoryId:m.memoryId,
  rawRecordDigest:'sha256:v1:'+'a'.repeat(64),
  projectedMemoryDigest:hash(m),
  permitsAtomicCommit:false,permitsHttpReveal:false,
}));
const envelope:SeyeonR21OfflineDerivedSourceEnvelopeV1={
  version:SEYEON_R21_OFFLINE_DERIVED_SOURCE_CLOSURE_V1,
  preflightState:'not_run',
  disclosureRetrievedPrivateSources:[],
  readerDerivedSources:[],workerDerivedSources:[],externalToolPrivateSources:[],
  sourceSnapshot:{
    version:SEYEON_PRODUCTION_CONTEXT_VERSION_V1,
    retrievedMemories:memories,
    personalRecordProjectionCandidates:candidates,
    personalRecordAdmissions:candidates.map(c=>({
      recordId:c.recordId,recordKind:c.recordKind,recordType:c.recordType,
      schemaVersion:c.schemaVersion,reason:'ADMITTED' as const,
    })),
    recentMessages:[],relationshipHistoryRecords:[],
    activeRelationshipEventCount:0,historyThroughRevision:0,
    relationshipRevisionUsedForTurn:null,
  },
};
const check=(change:Partial<Parameters<typeof assertSeyeonR21OfflineDerivedSourceClosureV1>[0]>={})=>
  assertSeyeonR21OfflineDerivedSourceClosureV1({
    envelope,retrievedMemories:memories,sourceCandidates:candidates,...change,
  });
const withMemories=(next:readonly SeyeonRetrievedMemoryV2[])=>({
  ...envelope,
  sourceSnapshot:{...envelope.sourceSnapshot,retrievedMemories:next},
});

describe('S0 R21 two original model-source preflight admission (never Provider permission)',()=>{
  it('admits only an exact pair of server-projected original Memories',()=>{
    expect(()=>check()).not.toThrow();
    expect(()=>check({sourceCandidates:[candidates[1]!,candidates[0]!]}))
      .toThrow(SeyeonR21DerivedSourceClosureHoldV1);
  });

  it('holds if either source projection, ID or Grant is changed',()=>{
    for(const forged of [
      [candidates[0]!],
      [candidates[0]!,{...candidates[1]!,grantId:origins[0][1]}],
      [candidates[0]!,{...candidates[1]!,projectedMemoryDigest:hash('forged')}],
      [candidates[0]!,candidates[0]!],
    ]){
      expect(()=>check({sourceCandidates:forged}))
        .toThrow(SeyeonR21DerivedSourceClosureHoldV1);
    }
    const altered=[{...memories[0]!,summary:'Changed source'},memories[1]!];
    expect(()=>check({retrievedMemories:altered,envelope:withMemories(altered)}))
      .toThrow(SeyeonR21DerivedSourceClosureHoldV1);
  });

  it('rejects a partial set, unpinned derived relationship and unknown source ingress',()=>{
    const partial=[memories[0]!];
    expect(()=>check({retrievedMemories:partial,envelope:withMemories(partial)}))
      .toThrow(SeyeonR21DerivedSourceClosureHoldV1);
    const event:SeyeonRetrievedMemoryV2={
      kind:'relationship_event',memoryId:'relationship:synthetic',
      sourceRef:'relationship:synthetic',claimKind:'fact',summary:'Derived content',
      relevance:0.9,salience:0.9,
    };
    const mixed=[memories[0]!,event,memories[1]!];
    expect(()=>check({retrievedMemories:mixed,envelope:withMemories(mixed)}))
      .toThrow(SeyeonR21DerivedSourceClosureHoldV1);
    expect(()=>check({envelope:{...envelope,readerDerivedSources:['unverified']}}))
      .toThrow(SeyeonR21DerivedSourceClosureHoldV1);
    expect(()=>check({envelope:{...envelope,preflightState:'already_ran'} as
      unknown as SeyeonR21OfflineDerivedSourceEnvelopeV1}))
      .toThrow(SeyeonR21DerivedSourceClosureHoldV1);
  });

  it('rejects incomplete or contradictory DB admissions even with two plausible sources',()=>{
    expect(()=>check({envelope:{...envelope,sourceSnapshot:{
      ...envelope.sourceSnapshot,
      personalRecordAdmissions:envelope.sourceSnapshot.personalRecordAdmissions.slice(0,1),
    }}})).toThrow(SeyeonR21DerivedSourceClosureHoldV1);
    expect(()=>check({envelope:{...envelope,sourceSnapshot:{
      ...envelope.sourceSnapshot,
      historyThroughRevision:1,
    }}})).toThrow(SeyeonR21DerivedSourceClosureHoldV1);
  });
});
