// Watchtower-Track: character-memory
import {describe,expect,it} from 'vitest';
import {evaluateCharacterChangedFactOfflineV1 as evaluate,
 type CharacterChangedFactGoldV1}
 from '../packages/domain/src/character-memory-changed-fact-offline-evaluation-v1.js';
import type {CharacterMemoryRetrievalResultV1}
 from '../packages/domain/src/character-memory-retrieval-v1.js';
const scope={subjectId:'member-synthetic',characterId:'seyeon',threadId:'thread-synthetic'};
const t0='2026-01-01T00:00:00.000Z';
const t1='2026-02-28T23:59:59.000Z';
const t2='2026-03-01T00:00:00.000Z';
const after='2026-03-02T00:00:00.000Z';
const before='2026-02-02T00:00:00.000Z';
const old:CharacterChangedFactGoldV1={
 ...scope, factId:'fact-old',grantId:'grant-old',
 sourceRef:'life_fact:fact-old:grant:grant-old',
 factType:'synthetic_preference',valueDigest:'1'.repeat(64),
 sourceKind:'user_explicit',
 createdAt:t0,confirmedAt:t0,grantedAt:t0,validFrom:t0,
 validTo:t1,revokedAt:null,supersedesSourceRef:null,
};
const newer:CharacterChangedFactGoldV1={
 ...scope,factId:'fact-new',grantId:'grant-new',
 sourceRef:'life_fact:fact-new:grant:grant-new',
 factType:'synthetic_preference',valueDigest:'2'.repeat(64),
 sourceKind:'profile_edit',
 createdAt:t2,confirmedAt:t2,grantedAt:t2,validFrom:t2,
 validTo:null,revokedAt:null,supersedesSourceRef:old.sourceRef,
};
function retrieve(facts:readonly CharacterChangedFactGoldV1[],asOf=after):CharacterMemoryRetrievalResultV1{
 return {
  schemaVersion:'character-memory-retrieval-v1',
  scope:{...scope,relationshipRevision:null},
  retrievalMode:'lexical+metadata',
  querySourceTurn:{messageId:'current-synthetic',sequenceNo:1,createdAt:asOf,text:'synthetic recall'},
  records:facts.map((f,i)=>({
   rank:i+1,
   record:{
    recordKind:'life_fact',recordId:f.factId,recordType:f.factType,
    schemaVersion:'fixture-v1',projectorVersion:'source-projector-v1',
    claimKind:'fact',summary:'private synthetic source (redacted in reports)',
    sourceRef:f.sourceRef,grantId:f.grantId,
    granteeCharacterId:scope.characterId,grantReason:'user_choice',
    grantedAt:f.grantedAt,sourceKind:f.sourceKind,
    sourceMessageId:'message-'+f.factId,sourceMergeActionId:null,
    validFrom:f.validFrom,validTo:f.validTo,confirmedAt:f.confirmedAt,
    createdAt:f.createdAt,relevance:1,salience:1,
   },
   signals:{lexicalCoverage:1,phraseMatch:false,explicitCallbackMatch:true,
    callbackFallbackUsed:false,relevance:1,salience:1,effectiveAt:f.confirmedAt},
  })),
  trace:{queryTokenCount:1,explicitCallbackRequested:true,
   callbackFallbackUsed:false,candidateCount:facts.length,
   matchedCandidateCount:facts.length,unsupportedSchemaCount:0,
   selectedSourceRefs:facts.map(f=>f.sourceRef),excluded:[]},
 };
}
function input(asOf:string,observed:readonly CharacterChangedFactGoldV1[],
 gold:readonly CharacterChangedFactGoldV1[]=[old,newer]){
 return {scope,asOf,queryFactTypes:['synthetic_preference'],
  sourceGold:gold,retrieval:retrieve(observed,asOf)};
}
describe('source-pinned offline fact updates and supersession',()=>{
 it('returns old fact before correction and new fact after correction',()=>{
  for(const [date,records] of [[before,[old]],[after,[newer]]] as const){
   const result=evaluate(input(date,records));
   expect(result.passed).toBe(true);
   expect(result.expectedCurrentCount).toBe(1);
   expect(result.staleOrUnsupportedCount).toBe(0);
   expect(result.modelSemanticRecallVerified).toBe(false);
   expect(result.productionMemoryWriteAllowed).toBe(false);
   expect(JSON.stringify(result)).not.toContain('fact-new');
   expect(JSON.stringify(result)).not.toContain('fact-old');
   expect(JSON.stringify(result)).not.toContain('member-synthetic');
  }
 });
 it('rejects stale superseded source after update even if retrieved summary is persuasive',()=>{
  const result=evaluate(input(after,[old]));
  expect(result.passed).toBe(false);
  expect(result.staleOrUnsupportedCount).toBe(1);
  expect(result.observedSelectionMatchesGold).toBe(false);
 });
 it('never promotes future confirmation, creation or grant at an earlier turn',()=>{
  const result=evaluate(input(before,[newer]));
  expect(result.passed).toBe(false);
  expect(result.staleOrUnsupportedCount).toBe(1);
 });
 it('overlapping independently pinned contradictory facts must HOLD',()=>{
  const overlapping={...old,validTo:null};
  const result=evaluate(input(after,[newer],[overlapping,newer]));
  expect(result.passed).toBe(false);
  expect(result.independentTimelineValid).toBe(false);
  expect(result.currentFactsUnambiguous).toBe(false);
 });
 it('unknown, wrong-topic or backwards supersession cannot authorize a replacement',()=>{
  for(const invalid of [
   {...newer,supersedesSourceRef:'life_fact:unknown:grant:unknown'},
   {...newer,factType:'unrelated_topic'},
   {...newer,confirmedAt:t0},
   {...newer,validFrom:t1},
  ]){
   const result=evaluate(input(after,[invalid],[old,invalid]));
   expect(result.passed).toBe(false);
   expect(result.independentTimelineValid).toBe(false);
  }
 });
 it('revoked or expired source never becomes current and retrieval must abstain',()=>{
  const revoked={...old,revokedAt:t1};
  const noNew=evaluate(input(after,[],[revoked]));
  expect(noNew.passed).toBe(true);
  expect(noNew.expectedCurrentCount).toBe(0);
  const leak=evaluate(input(after,[revoked],[revoked]));
  expect(leak.passed).toBe(false);
  expect(leak.staleOrUnsupportedCount).toBe(1);
 });
 it('missing grant provenance, wrong scope and duplicate retrieval fail closed',()=>{
  const badGrant={...newer,grantId:'forged-other'};
  expect(evaluate(input(after,[newer],[old,badGrant])).passed).toBe(false);
  const wrongScope={...newer,subjectId:'foreign-subject'};
  expect(evaluate(input(after,[newer],[old,wrongScope])).passed).toBe(false);
  const doubled=evaluate(input(after,[newer,newer]));
  expect(doubled.passed).toBe(false);
  expect(doubled.observedSelectionMatchesGold).toBe(false);
  const mismatched=evaluate({...input(after,[newer]),
   retrieval:{...retrieve([newer]),scope:{...scope,subjectId:'foreign-subject',relationshipRevision:null}}});
  expect(mismatched.scopePinned).toBe(false);
  expect(mismatched.passed).toBe(false);
 });
 it('rejects source-kind, Character grant and fact-label rewriting with otherwise matching IDs',()=>{
  const original=input(after,[newer]);
  expect(evaluate(original).passed).toBe(true);
  const selected=original.retrieval.records[0]!;
  for(const record of [
    {...selected.record,sourceKind:'user_explicit' as const},
    {...selected.record,granteeCharacterId:'baekheon'},
    {...selected.record,claimKind:'character_interpretation' as const},
  ]){
    const altered={...original,retrieval:{
      ...original.retrieval,
      records:[{...selected,record}],
    }};
    const result=evaluate(altered);
    expect(result.passed).toBe(false);
    expect(result.observedSelectionMatchesGold).toBe(false);
    expect(result.modelSemanticRecallVerified).toBe(false);
    expect(result.productionMemoryWriteAllowed).toBe(false);
    const report=JSON.stringify(result);
    expect(report).not.toContain('fact-new');
    expect(report).not.toContain('grant-new');
    expect(report).not.toContain('member-synthetic');
  }
 });
 it('rejects stale or forged retrieval current-turn timestamps',()=>{
  const shifted=evaluate({...input(after,[newer]),retrieval:retrieve([newer],before)});
  expect(shifted.passed).toBe(false);
  expect(shifted.scopePinned).toBe(false);
  const invalidSequence=evaluate({...input(after,[newer]),
   retrieval:{...retrieve([newer]),querySourceTurn:{
    ...retrieve([newer]).querySourceTurn,sequenceNo:0,
   }}});
  expect(invalidSequence.passed).toBe(false);
 });
 it('fact authority cannot predate record creation or be revoked before grant',()=>{
  const earlyGrant={...newer,grantedAt:t0};
  const first=evaluate(input(after,[earlyGrant],[old,earlyGrant]));
  expect(first.independentTimelineValid).toBe(false);
  const earlyRevocation={...newer,revokedAt:t0};
  const second=evaluate(input(after,[],[old,earlyRevocation]));
  expect(second.independentTimelineValid).toBe(false);
 });
 it('unrelated query fact type does not claim an irrelevant memory was required',()=>{
  const r=evaluate({...input(after,[],[old,newer]),queryFactTypes:['other_synthetic_topic']});
  expect(r.passed).toBe(true);
  expect(r.expectedCurrentCount).toBe(0);
 });
});
