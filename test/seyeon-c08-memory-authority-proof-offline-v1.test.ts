import {describe,expect,it} from 'vitest';
import {
  hashSeyeonC08MemorySummaryV1,
  requireSeyeonC08MemoryAuthorityProofV1,
} from '../apps/api/src/seyeon-c08-memory-authority-proof-v1.js';
import {createSeyeonC08ServerMemoryProofPortV1} from
  '../apps/api/src/seyeon-c08-server-memory-proof-port-v1.js';
import type {SeyeonRetrievedMemoryV2} from
  '../packages/domain/src/seyeon-runtime-context-v2.js';

const memory:SeyeonRetrievedMemoryV2={
  memoryId:'synthetic:memory-1',sourceRef:'synthetic:source-1',
  kind:'memory',claimKind:'fact',summary:'사용자가 차를 좋아한다고 말했다.',
  relevance:0.8,salience:0.5,
};
const key={subjectId:'synthetic:owner',threadId:'synthetic:thread',
  currentUserMessageId:'synthetic:msg-1'};
function proof(overrides:Record<string,unknown>={}){
  return {schemaVersion:'seyeon-c08-memory-authority-proof-v1',
    ...key,characterId:'seyeon',memoryId:memory.memoryId,
    sourceRef:memory.sourceRef,kind:memory.kind,claimKind:'fact',
    summaryHash:hashSeyeonC08MemorySummaryV1(memory.summary),
    grantState:'ACTIVE',complete:true,
    origin:'AUTHORITATIVE_STORED_USER_MEMORY',assistantGenerated:false,
    ...overrides};
}
describe('C08 memory grant verification (NO model calls, no reveal)',()=>{
  it('returns only memory references, never content or an output/LLM permission',async()=>{
    let requests=0;
    const got=await requireSeyeonC08MemoryAuthorityProofV1({
      ...key,memory,
      port:{async readAuthoritativeMemoryGrant(query){
        requests++;
        expect(query).toMatchObject({
          ...key,characterId:'seyeon',
          memoryId:memory.memoryId,sourceRef:memory.sourceRef,
        });
        return proof();
      }},
    });
    expect(requests).toBe(1);
    expect(got).toEqual({
      verified:true,memoryId:memory.memoryId,sourceRef:memory.sourceRef,
      memoryMayBeSentToModel:false,memoryMayBeQuotedToUser:false,
      serverRenderedSlotRequired:true,
    });
    expect(JSON.stringify(got)).not.toContain(memory.summary);
  });

  it('uses a server-owned scoped Grant reader and never returns private memory content',async()=>{
    let reads=0;
    const port=createSeyeonC08ServerMemoryProofPortV1({
      subjectId:key.subjectId,threadId:key.threadId,
      async readScopedMemoryGrant(query){
        reads++;
        expect(query).toMatchObject({...key,characterId:'seyeon',
          memoryId:memory.memoryId,sourceRef:memory.sourceRef});
        return {subjectId:key.subjectId,threadId:key.threadId,
          characterId:'seyeon',memoryId:memory.memoryId,
          sourceRef:memory.sourceRef,kind:'memory',claimKind:'fact',
          summary:memory.summary,grantState:'ACTIVE',
          origin:'AUTHORITATIVE_STORED_USER_MEMORY',
          assistantGenerated:false,complete:true};
      },
    });
    const got=await requireSeyeonC08MemoryAuthorityProofV1({
      ...key,memory,port,
    });
    expect(reads).toBe(1);
    expect(got.verified).toBe(true);
    expect(got.memoryMayBeSentToModel).toBe(false);
    expect(JSON.stringify(got)).not.toContain(memory.summary);
    const spoofedPort=createSeyeonC08ServerMemoryProofPortV1({
      subjectId:'different:owner',threadId:key.threadId,
      async readScopedMemoryGrant(){throw Error('MUST_NOT_READ');},
    });
    await expect(requireSeyeonC08MemoryAuthorityProofV1({
      ...key,memory,port:spoofedPort,
    })).rejects.toThrow('LOCAL_MEMORY_AUTHORITY_UNPROVEN');
  });

  it('holds revoked ACL, absent fact authority, wrong source, tampering, or assistant-created history',async()=>{
    const cases=[
      {grantState:'REVOKED'},{grantState:'MISSING'},
      {sourceRef:'synthetic:other'}, {memoryId:'synthetic:other'},
      {summaryHash:'sha256:'+'f'.repeat(64)},
      {origin:'ASSISTANT_CONVERSATION'},
      {assistantGenerated:true},{complete:false},
      {characterId:'other'}, {subjectId:'other'}, {claimKind:'character_interpretation'},
      {kind:'relationship_event'},
    ];
    for(const patch of cases){
      await expect(requireSeyeonC08MemoryAuthorityProofV1({
        ...key,memory,port:{async readAuthoritativeMemoryGrant(){return proof(patch);}},
      })).rejects.toThrow('LOCAL_MEMORY_AUTHORITY_UNPROVEN');
    }
  });

  it('does not resolve relationship-event claims or unsupported user interpretations',async()=>{
    for(const value of [
      {...memory,kind:'relationship_event' as const,
        causalAuthority:'authorized_shared_history' as const},
      {...memory,claimKind:'character_interpretation' as const},
      {...memory,summary:''},
    ]){
      let reads=0;
      await expect(requireSeyeonC08MemoryAuthorityProofV1({
        ...key,memory:value,
        port:{async readAuthoritativeMemoryGrant(){reads++;return proof();}},
      })).rejects.toThrow('LOCAL_MEMORY_AUTHORITY_UNPROVEN');
      expect(reads).toBe(0);
    }
  });
});
