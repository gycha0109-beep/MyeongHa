import {describe,expect,it} from 'vitest';
import {
  SEYEON_C08_FACT_SLOT_READ_VERSION_V1,
  admitSeyeonC08ImmutableFactSlotV1,
  requireSeyeonC08FactSlotStillCurrentV1,
} from '../apps/api/src/seyeon-c08-immutable-fact-slot-v1.js';
import {createSeyeonC08ServerFactSlotPortV1} from
  '../apps/api/src/seyeon-c08-server-fact-slot-port-v1.js';
import {createSeyeonC08ServerMemoryProofPortV1} from
  '../apps/api/src/seyeon-c08-server-memory-proof-port-v1.js';
import type {SeyeonRetrievedMemoryV2} from
  '../packages/domain/src/seyeon-runtime-context-v2.js';

const ids={subjectId:'synthetic:owner',threadId:'synthetic:thread',
  currentUserMessageId:'synthetic:user-1'};
const memory:SeyeonRetrievedMemoryV2={
  memoryId:'synthetic:record-1',sourceRef:'synthetic:source-1',
  kind:'life_fact',claimKind:'fact',summary:'사용자는 녹차를 좋아한다고 확인했다.',
  relevance:0.8,salience:0.8,
};
function source(overrides:Record<string,unknown>={}){
  return {
    ...ids,characterId:'seyeon' as const,
    memoryId:memory.memoryId,sourceRef:memory.sourceRef,
    kind:'life_fact' as const,claimKind:'fact' as const,
    summary:memory.summary,recordState:'ACTIVE' as const,
    grantState:'ACTIVE' as const,
    origin:'AUTHORITATIVE_STORED_USER_MEMORY' as const,
    assistantGenerated:false as const,complete:true as const,
    sourceRevision:'revision-7',grantId:'grant-1',
    grantRevision:'revision-3',...overrides,
  };
}
function harness(){
  let row=source();
  let proofReads=0,factReads=0;
  const proofPort=createSeyeonC08ServerMemoryProofPortV1({
    subjectId:ids.subjectId,threadId:ids.threadId,
    async readScopedMemoryGrant(){
      proofReads++;
      return {subjectId:row.subjectId,threadId:row.threadId,
        characterId:'seyeon',memoryId:row.memoryId,
        sourceRef:row.sourceRef,kind:'life_fact',
        claimKind:'fact',summary:row.summary,
        grantState:row.grantState==='ACTIVE'?'ACTIVE':'REVOKED',
        origin:row.origin,assistantGenerated:row.assistantGenerated,
        complete:row.complete};
    },
  });
  const factSlotPort=createSeyeonC08ServerFactSlotPortV1({
    subjectId:ids.subjectId,threadId:ids.threadId,
    async readScopedFactAndGrant(){
      factReads++;
      return row;
    },
  });
  return {
    input:{...ids,memory,proofPort,factSlotPort},
    change(patch:Record<string,unknown>){row=source(patch);},
    get proofReads(){return proofReads;},
    get factReads(){return factReads;},
  };
}
describe('C08 immutable server-owned fact slot (offline metadata only)',()=>{
  it('binds exact scoped source and Grant revisions, but never exposes content',async()=>{
    const h=harness();
    const slot=await admitSeyeonC08ImmutableFactSlotV1(h.input);
    expect(Object.isFrozen(slot)).toBe(true);
    expect(slot).toMatchObject({
      schemaVersion:'seyeon-c08-immutable-fact-slot-v1',
      ...ids,characterId:'seyeon',
      kind:'life_fact',sourceRevision:'revision-7',
      grantId:'grant-1',grantRevision:'revision-3',
      authority:'SERVER_SOURCED_FACT_METADATA_ONLY',
      modelContentAccess:'DENIED',userQuoteAccess:'DENIED',
      rendering:'SERVER_PROTECTED_CONTRACT_REQUIRED',
    });
    expect(slot.bindingHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(JSON.stringify(slot)).not.toContain(memory.summary);
    expect(h.proofReads).toBe(1);
    expect(h.factReads).toBe(1);
    await requireSeyeonC08FactSlotStillCurrentV1({...h.input,slot});
    expect(h.proofReads).toBe(2);
    expect(h.factReads).toBe(2);
  });

  it('denies revoked and mismatched authority before fact contents can travel',async()=>{
    for(const patch of [
      {grantState:'REVOKED'}, {recordState:'REVOKED'},
      {sourceRef:'synthetic:other'}, {subjectId:'synthetic:other'},
      {threadId:'synthetic:other'}, {characterId:'other'},
      {origin:'ASSISTANT_CONVERSATION'}, {assistantGenerated:true},
      {claimKind:'character_interpretation'}, {kind:'relationship_event'},
      {summary:'different claimed history'}, {complete:false},
      {sourceRevision:''}, {grantRevision:''}, {grantId:''},
    ]){
      const h=harness();h.change(patch);
      await expect(admitSeyeonC08ImmutableFactSlotV1(h.input))
        .rejects.toThrow();
    }
  });

  it('holds stale snapshots, replacement grants, summary changes and tampered slots',async()=>{
    for(const patch of [
      {sourceRevision:'revision-8'},{grantRevision:'revision-4'},
      {grantId:'grant-2'}, {summary:'사용자는 커피를 좋아한다고 확인했다.'},
      {grantState:'REVOKED'},
    ]){
      const h=harness();
      const slot=await admitSeyeonC08ImmutableFactSlotV1(h.input);
      h.change(patch);
      await expect(requireSeyeonC08FactSlotStillCurrentV1({...h.input,slot}))
        .rejects.toThrow();
    }
    const h=harness();
    const slot=await admitSeyeonC08ImmutableFactSlotV1(h.input);
    await expect(requireSeyeonC08FactSlotStillCurrentV1({
      ...h.input,slot:{...slot,modelContentAccess:'ALLOWED' as 'DENIED'},
    })).rejects.toThrow('LOCAL_FACT_SLOT_AUTHORITY_UNPROVEN');
  });

  it('accepts ordinary scoped ID characters but rejects control bytes before any authority read',async()=>{
    const normal=harness();
    // The canonical synthetic message ID includes both 'u' and '1'.
    // Neither is a control code; a mis-escaped character class once blocked it.
    const admitted=await admitSeyeonC08ImmutableFactSlotV1(normal.input);
    expect(admitted.currentUserMessageId).toBe('synthetic:user-1');
    for(const forbidden of ['\u0000','\u0009','\u000a','\u001f','\u007f']){
      const h=harness();
      await expect(admitSeyeonC08ImmutableFactSlotV1({
        ...h.input,currentUserMessageId:'synthetic:user-1'+forbidden,
      })).rejects.toThrow('LOCAL_FACT_SLOT_AUTHORITY_UNPROVEN');
      expect(h.proofReads).toBe(0);
      expect(h.factReads).toBe(0);
    }
  });

  it('does not accept fabricated source data or relationship events as facts',async()=>{
    const h=harness();
    const forged={...h.input,
      memory:{...memory,kind:'relationship_event' as const,
        claimKind:'character_interpretation' as const}};
    await expect(admitSeyeonC08ImmutableFactSlotV1(forged))
      .rejects.toThrow('LOCAL_FACT_SLOT_AUTHORITY_UNPROVEN');
    expect(h.proofReads).toBe(0);
    const raw={...source(),
      schemaVersion:SEYEON_C08_FACT_SLOT_READ_VERSION_V1,
      summary:'source has drifted'};
    await expect(admitSeyeonC08ImmutableFactSlotV1({
      ...h.input,factSlotPort:{async readAuthoritativeFactSlot(){return raw;}},
    })).rejects.toThrow('LOCAL_FACT_SLOT_AUTHORITY_UNPROVEN');
  });
});
