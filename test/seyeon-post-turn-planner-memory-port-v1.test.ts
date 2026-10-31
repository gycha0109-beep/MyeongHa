// Watchtower-Track: security
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  createSeyeonPostTurnPlannerMemoryPortV1,
  SEYEON_POST_TURN_MEMORY_PORT_V1,
} from '../apps/api/src/seyeon-post-turn-planner-memory-port-v1.js';

const SUBJECT='11111111-1111-4111-8111-111111111111';
const TURN='22222222-2222-4222-8222-222222222222';
const committedTurn={
  turnId:TURN,
  userMessageId:'33333333-3333-4333-8333-333333333333',
  userText:'나는 나비라는 고양이를 키워',
  assistantMessageId:'44444444-4444-4444-8444-444444444444',
  assistantText:'나비라는 고양이, 정말 귀엽겠네요.',
};
const proposalInput={
  subjectId:SUBJECT,
  outboxEventId:'55555555-5555-4555-8555-555555555555',
  committedTurn,
};

describe('UC-06 post-turn Worker -> Planner memory port',()=>{
  it('binds source to existing post-turn Worker behind private text authority and leaves Production DENY',()=>{
    const worker=readFileSync(new URL('../apps/api/src/seyeon-post-turn-analysis-worker-v1.ts',import.meta.url),'utf8');
    const runtime=readFileSync(new URL('../apps/api/src/production-seyeon-post-turn-worker-runtime-v1.ts',import.meta.url),'utf8');
    const sourceGuard=worker.indexOf('if (input.enforceCurrentSourceAuthority === true)');
    const claim=worker.indexOf('const claimed = one(');
    const snapshot=worker.indexOf('const snapshot = validateSeyeonPostTurnAnalysisSnapshotV1(',
      claim);
    const checkpoint=worker.indexOf('if (claimed.checkpointJsonb !== null)',snapshot);
    const off=worker.indexOf("if (snapshot.mode === 'OFF')",checkpoint);
    const planner=worker.indexOf('if (input.plannerMemoryPort !== undefined)',off);
    const extraction=worker.indexOf('const extractionContext = Object.freeze({',planner);
    expect(sourceGuard).toBeGreaterThan(0);
    expect(claim).toBeGreaterThan(sourceGuard);
    expect(snapshot).toBeGreaterThan(claim);
    expect(checkpoint).toBeGreaterThan(snapshot);
    expect(off).toBeGreaterThan(checkpoint);
    expect(planner).toBeGreaterThan(off);
    expect(extraction).toBeGreaterThan(planner);
    expect(runtime).toContain('enforceCurrentSourceAuthority: true');
    expect(runtime).toContain('plannerMemoryPort: createSeyeonPostTurnPlannerMemoryPortV1({');
    expect(SEYEON_POST_TURN_MEMORY_PORT_V1.productionModelAndDbAdmission).toBe('DENY');
  });

  it('rejects fresh Planner request before Provider or DB if G0/G4 admission is absent',async()=>{
    const pool={connect:vi.fn()};
    const provider={generate:vi.fn()};
    const port=createSeyeonPostTurnPlannerMemoryPortV1({
      pool:pool as never,
      verifiedEvidence:{kind:'member',verifiedAuthUserId:SUBJECT},
      governedProvider:provider as never,
    });
    await expect(port.propose(proposalInput))
      .rejects.toMatchObject({code:'SEYEON_POST_TURN_PLANNER_MEMORY_HOLD'});
    expect(pool.connect).not.toHaveBeenCalled();
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('explicit synthetic stage delegates only exact committed IDs/text to the canonical Member DB transaction',async()=>{
    const provider={generate:vi.fn(async()=>({
      decision:'propose',
      claimAuthority:'user_asserted',
      summary:'사용자는 나비라는 고양이를 키운다',
      userEvidenceQuote:'나비라는 고양이를 키워',
    }))};
    const captured:{sql:string;values?:readonly unknown[]}[]=[];
    const query=vi.fn(async(sql:string,values?:readonly unknown[])=>{
      captured.push(values === undefined ? {sql} : {sql,values});
      if(sql.includes('begin_member_subject_context_v1'))
        return {rows:[{subjectId:SUBJECT,subjectKind:'member'}]};
      if(sql.includes('cmd_create_pending_seyeon_planner_memory_v1'))
        return {rows:[{proposalId:values?.[1],proposalState:'pending',replayed:false}]};
      return {rows:[]};
    });
    const pool={connect:vi.fn(async()=>({query,release:vi.fn()}))};
    const port=createSeyeonPostTurnPlannerMemoryPortV1({
      pool:pool as never,
      verifiedEvidence:{kind:'member',verifiedAuthUserId:SUBJECT},
      governedProvider:provider as never,
      approvedModelAndDbStage:()=>true,
    });
    const result=await port.propose(proposalInput);
    expect(result.decision).toBe('pending');
    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(captured.find(x=>x.sql.includes('cmd_create_pending_seyeon_planner_memory_v1'))?.values)
      .toEqual([SUBJECT,result.decision==='pending'?result.proposalId:'',
        TURN,committedTurn.assistantMessageId,committedTurn.userMessageId,
        '사용자는 나비라는 고양이를 키운다','나비라는 고양이를 키워']);
    expect(captured.map(x=>x.sql)).toContain('COMMIT');
    expect(pool.connect).toHaveBeenCalledTimes(1);
  });
});
