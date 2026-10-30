// Watchtower-Track: security
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '../packages/domain/src/index.js';
import {
  processSeyeonPostTurnAnalysisV1,
} from '../apps/api/src/seyeon-post-turn-analysis-worker-v1.js';

const subjectId='11111111-1111-4111-8111-111111111111';
const turnId='22222222-2222-4222-8222-222222222222';
const userMessageId='33333333-3333-4333-8333-333333333333';
const assistantMessageId='44444444-4444-4444-8444-444444444444';
const outboxEventId='55555555-5555-4555-8555-555555555555';
const proposalId='66666666-6666-4666-8666-666666666666';
const userText='나는 나비라는 고양이를 키워';
const assistantText='나비라는 이름이 귀엽네요';
const instant='2026-10-30T00:00:00.000Z';

function fixture(mode:'SHADOW'|'OFF'='SHADOW',
  checkpointJsonb:unknown|null=null,assistantOverride=assistantText){
  const snapshot={
    schemaVersion:'seyeon-post-turn-analysis-snapshot-v1',
    mode,turnId,userMessageId,assistantMessageId,preparedAt:instant,
    productionAuthorityRef:'synthetic-trusted-commit',
    interpretation:{},envelope:{utterance:assistantText},
    eventAuthorityEvidence:{integrityDecisions:[],riskCausality:[]},
    priorEvents:[],relationshipBefore:{},productionCausalBindings:[],
    identity:{
      experimentalEventId:'event-synthetic',
      experimentalEventDedupeKey:'event-dedupe-synthetic',
      productionEventId:'prod-event-synthetic',
      relationshipSyncOutboxEventId:'rel-outbox-synthetic',
    },
  };
  const snapshotHash='sha256:v1:'+
    createHash('sha256').update(canonicalJson(snapshot)).digest('hex');
  const claimed={
    outboxEventId,turnId,attemptId:'77777777-7777-4777-8777-777777777777',
    userMessageId,userText,assistantMessageId,assistantText:assistantOverride,
    committedAt:instant,snapshotJsonb:snapshot,snapshotHash,checkpointJsonb,
    status:'processing',lockOwner:'synthetic-worker',leaseExpiresAt:instant,
    reclaimed:false,
  };
  const port={
    claim:vi.fn(async()=>[claimed]),
    checkpoint:vi.fn(async()=>[{outboxEventId,status:'processing',replayed:false}]),
    complete:vi.fn(async()=>[{
      outboxEventId,status:'processed',processedAt:instant,replayed:false,
    }]),
    findByTurn:vi.fn(async()=>[]),
  };
  const extractorProvider={
    generate:vi.fn(async()=>({
      schemaVersion:'seyeon-event-extraction-candidate-exp-v2',
      decision:'none',reason:'No durable relationship event',
    })),
  };
  const plannerMemoryPort={
    propose:vi.fn(async()=>({decision:'pending' as const,proposalId,replayed:false})),
  };
  const run=()=>processSeyeonPostTurnAnalysisV1({
    subjectId,outboxEventId,lockOwner:'synthetic-worker',
    leaseExpiresAt:instant,
    outboxPort:port,
    extractorProvider:extractorProvider as never,
    plannerMemoryPort,
  });
  return{run,port,extractorProvider,plannerMemoryPort};
}

describe('UC-06 committed post-turn Planner proposal integration',()=>{
  it('uses the DB-claimed exact source once before optional relationship extraction',async()=>{
    const f=fixture();
    const result=await f.run();
    expect(result.decision).toBe('none');
    expect(f.plannerMemoryPort.propose).toHaveBeenCalledTimes(1);
    expect(f.plannerMemoryPort.propose).toHaveBeenCalledWith({
      subjectId,outboxEventId,committedTurn:{
        turnId,userMessageId,userText,assistantMessageId,assistantText,
      },
    });
    expect(f.extractorProvider.generate).toHaveBeenCalledTimes(1);
    expect(f.port.checkpoint).toHaveBeenCalledTimes(1);
    expect(f.port.complete).toHaveBeenCalledTimes(1);
  });

  it('never calls Planner for OFF or an already checkpointed turn',async()=>{
    const off=fixture('OFF');
    expect((await off.run()).decision).toBe('disabled');
    expect(off.plannerMemoryPort.propose).not.toHaveBeenCalled();

    const checkpoint=fixture('SHADOW',{
      schemaVersion:'seyeon-post-turn-analysis-checkpoint-v1',
      decision:'none',
    });
    expect((await checkpoint.run()).decision).toBe('none');
    expect(checkpoint.plannerMemoryPort.propose).not.toHaveBeenCalled();
  });

  it('cannot call Planner for a mismatched committed assistant message',async()=>{
    const f=fixture('SHADOW',null,'assistant text differs from committed snapshot');
    await expect(f.run()).rejects.toThrow(
      'Committed Chat material does not match the post-turn analysis snapshot.');
    expect(f.plannerMemoryPort.propose).not.toHaveBeenCalled();
    expect(f.extractorProvider.generate).not.toHaveBeenCalled();
  });

  it('fails closed before relationship extraction and checkpoint if Planner returns a forged receipt',async()=>{
    const f=fixture();
    f.plannerMemoryPort.propose.mockResolvedValueOnce({
      decision:'pending',proposalId:'not-a-uuid',replayed:false,
    } as never);
    await expect(f.run()).rejects.toMatchObject({
      code:'SEYEON_POST_TURN_SOURCE_AUTHORITY_HOLD',
    });
    expect(f.extractorProvider.generate).not.toHaveBeenCalled();
    expect(f.port.checkpoint).not.toHaveBeenCalled();
    expect(f.port.complete).not.toHaveBeenCalled();
  });
});
