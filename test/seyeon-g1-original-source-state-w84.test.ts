// Watchtower-Track: security
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {canonicalJson} from '../packages/domain/src/index.js';
import {
  classifySeyeonG1OriginalSourceStateV1,
  SeyeonG1OriginalSourceStateHoldV1,
} from '../apps/api/src/seyeon-g1-original-source-state-v1.js';
import type {SeyeonProductionContextSnapshotV1}
  from '../apps/api/src/seyeon-production-context-v1.js';
import type {RunSeyeonCharacterTurnV2Input}
  from '../apps/api/src/seyeon-character-runtime-v2.js';

const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const h=(v:unknown)=>'sha256:v1:'+
  createHash('sha256').update(canonicalJson(v)).digest('hex');
const one={
  memoryId:'memory:'+id(6),kind:'memory' as const,
  claimKind:'fact' as const,summary:'synthetic projected memory',
  sourceRef:'memory:'+id(6)+':grant:'+id(7),
  relevance:0.6,salience:0.7,
};
const admission={
  recordId:id(6),recordKind:'memory' as const,
  recordType:'conversation_recall',schemaVersion:'v1',
  reason:'ADMITTED' as const,
};
const original={
  recordKind:'memory' as const,recordId:id(6),grantId:id(7),
  recordType:'conversation_recall',schemaVersion:'v1',
  projectedMemoryId:one.memoryId,rawRecordDigest:h({raw:'fixture'}),
  projectedMemoryDigest:h(one),rawRecordPgDigest:'sha256:pg-jsonb:v1:'+'a'.repeat(64),
  projectorVersion:'seyeon-conversation-recall-projector-v1',
  permitsAtomicCommit:false as const,permitsHttpReveal:false as const,
};
const snapshot=(overrides:Partial<SeyeonProductionContextSnapshotV1>={}):
  SeyeonProductionContextSnapshotV1=>({
    version:'seyeon-production-context-v1',
    relationshipRevisionUsedForTurn:0,historyThroughRevision:0,
    recentMessages:[],retrievedMemories:[],
    personalRecordAdmissions:[],personalRecordProjectionCandidates:[],
    activeRelationshipEventCount:0,relationshipHistoryRecords:[],
    ...overrides,
  });
const model=(records:RunSeyeonCharacterTurnV2Input['contextInput']['retrievedMemories']=[]):
  RunSeyeonCharacterTurnV2Input['contextInput']=>({
    relationship:null,retrievedMemories:records,recentMessages:[],
  });
const check=(c:SeyeonProductionContextSnapshotV1,m=model())=>
  classifySeyeonG1OriginalSourceStateV1({context:c,modelInput:m});

describe('W84 G1 distinguishes zero, missing, unsupported, and unknown original sources',()=>{
  it('classifies explicit zero without minting authority',()=>{
    const result=check(snapshot());
    expect(result).toMatchObject({
      state:'EXPLICIT_ZERO',selectedPersonalRecordCount:0,
      unsupportedSchemaCount:0,authorizesModel:false,
      permitsAtomicCommit:false,permitsHttpReveal:false,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });
  it('keeps excluded unsupported Memory schema distinct from true zero',()=>{
    const result=check(snapshot({
      personalRecordAdmissions:[{...admission,reason:'UNSUPPORTED_SCHEMA'}],
    }));
    expect(result).toMatchObject({
      state:'UNSUPPORTED_SCHEMA_EXCLUDED',selectedPersonalRecordCount:0,
      unsupportedSchemaCount:1,authorizesModel:false,
    });
  });
  it('marks unpinned selected Memory as missing original even when admission says ADMITTED',()=>{
    expect(check(snapshot({
      retrievedMemories:[one],personalRecordAdmissions:[admission],
    }),model([one])).state).toBe('MISSING_ORIGINAL');
    expect(check(snapshot({
      retrievedMemories:[one],personalRecordProjectionCandidates:[original],
    }),model([one])).state).toBe('MISSING_ORIGINAL');
  });
  it('distinguishes an exact one-Memory CANDIDATE from authorized Provider dispatch',()=>{
    expect(check(snapshot({
      retrievedMemories:[one],personalRecordAdmissions:[admission],
      personalRecordProjectionCandidates:[original],
    }),model([one]))).toMatchObject({
      state:'ONE_MEMORY_CANDIDATE_ONLY',selectedPersonalRecordCount:1,
      authorizesModel:false,permitsAtomicCommit:false,permitsHttpReveal:false,
    });
  });
  it('marks mismatched or duplicate candidate, forged projection and unsupported selected type as HOLD',()=>{
    const base=snapshot({
      retrievedMemories:[one],personalRecordAdmissions:[admission],
      personalRecordProjectionCandidates:[original],
    });
    for(const mutated of [
      {...original,grantId:id(10)},
      {...original,projectedMemoryDigest:h({forged:'projection'})},
      {...original,projectorVersion:''},
    ]){
      expect(check({...base,personalRecordProjectionCandidates:[mutated]},model([one]))
        .state).toBe('UNKNOWN_ORIGINAL');
    }
    expect(check({...base,personalRecordProjectionCandidates:[original,original]},
      model([one])).state).toBe('UNKNOWN_ORIGINAL');
    expect(check({
      ...base,personalRecordAdmissions:[{...admission,reason:'UNSUPPORTED_SCHEMA'}],
    },model([one])).state).toBe('UNSUPPORTED_SELECTED_KIND');
    const lifeFact={...one,kind:'life_fact' as const,
      memoryId:'life_fact:'+id(6),sourceRef:'life_fact:'+id(6)+':grant:'+id(7)};
    expect(check(snapshot({
      retrievedMemories:[lifeFact],
    }),model([lifeFact])).state).toBe('UNSUPPORTED_SELECTED_KIND');
  });
  it('treats unknown admission, invalid selected memory and two selected originals as UNKNOWN',()=>{
    const bad=snapshot({
      retrievedMemories:[one],
      personalRecordAdmissions:[{...admission,reason:'UNDECLARED'} as unknown as typeof admission],
      personalRecordProjectionCandidates:[original],
    });
    expect(check(bad,model([one]))).toMatchObject({
      state:'UNKNOWN_ORIGINAL',selectedPersonalRecordCount:1,authorizesModel:false,
    });
    expect(check(snapshot({
      retrievedMemories:[one,one],personalRecordAdmissions:[admission],
      personalRecordProjectionCandidates:[original],
    }),model([one,one])).state).toBe('UNKNOWN_ORIGINAL');
    expect(check(null as unknown as SeyeonProductionContextSnapshotV1)
      .state).toBe('UNKNOWN_ORIGINAL');
  });
  it('proves the actual Production execution HOLD check happens BEFORE source selection/Provider',()=>{
    const src=readFileSync(new URL(
      '../apps/api/src/seyeon-production-chat-execution-v1.ts',import.meta.url,
    ),'utf8');
    const classifier=src.indexOf('const originalState=classifySeyeonG1OriginalSourceStateV1({');
    const hold=src.indexOf('throw new SeyeonG1OriginalSourceStateHoldV1(originalState.state);');
    const selection=src.indexOf('const exactModelPersonalSources = selectSeyeonExactModelPersonalSourcesV1({');
    const provider=src.indexOf('const runtime = await runSeyeonCharacterTurnV2({');
    expect(classifier).toBeGreaterThan(0);
    expect(hold).toBeGreaterThan(classifier);
    expect(selection).toBeGreaterThan(hold);
    expect(provider).toBeGreaterThan(selection);
    expect(new SeyeonG1OriginalSourceStateHoldV1('MISSING_ORIGINAL').code)
      .toBe('SEYEON_G1_ORIGINAL_SOURCE_NOT_ADMISSIBLE');
  });
});
