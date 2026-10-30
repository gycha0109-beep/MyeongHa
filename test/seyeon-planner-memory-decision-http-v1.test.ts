// Watchtower-Track: security
import { describe, expect, it, vi } from 'vitest';
import {
  planSeyeonPlannerMemoryDecisionV1,
  type PlannerMemoryChoiceV1,
} from '../apps/api/src/seyeon-planner-memory-decision-v1.js';
import {
  handleSeyeonPlannerMemoryDecisionRequestV1,
  SEYEON_PLANNER_MEMORY_DECISION_HTTP_V1,
} from '../apps/api/src/seyeon-planner-memory-decision-http-v1.js';

const SUBJECT='11111111-1111-4111-8111-111111111111';
const PROPOSAL='22222222-2222-4222-8222-222222222222';
const URL=`https://example.invalid/api/memory/proposals/${PROPOSAL}/decision`;
const MEMBER={kind:'member' as const,verifiedAuthUserId:SUBJECT};
const CANDIDATE={
  proposalId:PROPOSAL,proposalKind:'memory' as const,
  sourceAuthority:'db_verified_dialogue_planner' as const,
  characterId:'seyeon' as const,status:'pending' as const,
  subjectId:SUBJECT,
  sourceTurnCommitted:true as const,sourceCharacterMessageVerified:true as const,
};
const metadata={requestId:'memory-decision',serverTime:'2026-10-30T12:00:00Z'};
const send=(mode:PlannerMemoryChoiceV1,url=URL)=>new Request(url,{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({choice:{mode,...(mode==='character_only'?{characterId:'seyeon'}:{})}}),
});
const makePool=()=>{
  const queries:string[]=[];
  const query=vi.fn(async(sql:string,_args?:readonly unknown[])=>{
    queries.push(sql);
    if(sql.includes('begin_member_subject_context_v1'))
      return {rows:[{subjectId:SUBJECT,subjectKind:'member'}]};
    return {rows:[]};
  });
  const release=vi.fn();
  const connect=vi.fn(async()=>({query,release}));
  return {pool:{connect},queries,query,release};
};

describe('UC-07 server-owned Memory resolution',()=>{
  it('maps all four UX decisions to the preexisting domain resolution',()=>{
    for(const choice of ['session_only','character_only','current_characters','discard'] as const){
      const result=planSeyeonPlannerMemoryDecisionV1({
        candidate:CANDIDATE,choice,canonicalMemberSubjectId:SUBJECT,
        currentEligibleCharacterIds:['seyeon','baekheon'],
      });
      expect(result.proposalId).toBe(PROPOSAL);
      expect(result.requiresPayloadErasure).toBe(
        choice==='session_only'||choice==='discard');
      expect(result.expectedGrantCount).toBe(choice==='character_only'?1
        :choice==='current_characters'?2:0);
      expect(result.resolution.resolution).toBe(choice==='discard'?'reject'
        :choice==='session_only'?'session_only':'accept_long_term');
      expect(result.resolution.sessionContextAllowed).toBe(choice==='session_only');
    }
  });

  it('does not treat unverified source, foreign Subject or empty share snapshot as authority',()=>{
    for(const candidate of [
      {...CANDIDATE,sourceAuthority:'server_original_message'},
      {...CANDIDATE,status:'accepted'},
      {...CANDIDATE,subjectId:'33333333-3333-4333-8333-333333333333'},
      {...CANDIDATE,sourceTurnCommitted:false},
      {...CANDIDATE,sourceCharacterMessageVerified:false},
      {...CANDIDATE,characterId:'other'},
    ]){
      expect(()=>planSeyeonPlannerMemoryDecisionV1({
        candidate:candidate as never,choice:'character_only',
        canonicalMemberSubjectId:SUBJECT,currentEligibleCharacterIds:['seyeon'],
      })).toThrow();
    }
    for(const list of [[],['other'],['seyeon','seyeon']]){
      expect(()=>planSeyeonPlannerMemoryDecisionV1({
        candidate:CANDIDATE,choice:'current_characters',
        canonicalMemberSubjectId:SUBJECT,currentEligibleCharacterIds:list,
      })).toThrow();
    }
  });
});

describe('UC-07 verified Member HTTP + single Postgres transaction',()=>{
  it('defaults to 503 with no DB and no public route',async()=>{
    const db=makePool();
    const verifier={verifyRequestIdentity:vi.fn(async()=>MEMBER)};
    const response=await handleSeyeonPlannerMemoryDecisionRequestV1({
      request:send('character_only'),...metadata,pool:db.pool,
      identityEvidenceVerifier:verifier,
    });
    expect(SEYEON_PLANNER_MEMORY_DECISION_HTTP_V1.publicRouteMounted).toBe(false);
    expect(response.status).toBe(503);
    expect(db.pool.connect).not.toHaveBeenCalled();
  });

  it('blocks forged summaries, Subject, Character lists and unsupported scope before auth',async()=>{
    const db=makePool();
    const verifier={verifyRequestIdentity:vi.fn(async()=>MEMBER)};
    for(const body of [
      {},{choice:{mode:'private'}},{choice:{mode:'character_only'}},
      {choice:{mode:'current_characters',characterIds:['seyeon']}},
      {choice:{mode:'discard'},summary:'forged'},
      {choice:{mode:'character_only',characterId:'other'}},
      {choice:{mode:'session_only',proposalId:PROPOSAL}},
    ]){
      const response=await handleSeyeonPlannerMemoryDecisionRequestV1({
        request:new Request(URL,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify(body)}),
        ...metadata,pool:db.pool,identityEvidenceVerifier:verifier,
      });
      if(JSON.stringify(body)==='{"choice":{"mode":"discard"},"summary":"forged"}')
        expect(response.status).toBe(400);
      else expect(response.status).toBe(400);
    }
    expect(verifier.verifyRequestIdentity).not.toHaveBeenCalled();
    expect(db.pool.connect).not.toHaveBeenCalled();
  });

  it('denies Guest and missing Member before SQL',async()=>{
    for(const evidence of [null,{kind:'guest' as const,verifiedGuestTokenHash:'hash'}]){
      const db=makePool();
      const response=await handleSeyeonPlannerMemoryDecisionRequestV1({
        request:send('discard'),...metadata,pool:db.pool,
        identityEvidenceVerifier:{verifyRequestIdentity:async()=>evidence},
      });
      expect(response.status).toBe(evidence===null?401:403);
      expect(db.pool.connect).not.toHaveBeenCalled();
    }
  });

  for(const mode of ['session_only','character_only','current_characters','discard'] as const) {
    it(`commits verified ${mode} through Member context, exact grants and payload erasure`,async()=>{
      const db=makePool();
      const load=vi.fn(async()=>({
        candidate:CANDIDATE,currentEligibleCharacterIds:['seyeon','baekheon'],
      }));
      const commit=vi.fn(async({plan}:any)=>({
        proposalId:PROPOSAL,decision:mode,status:'resolved' as const,
        persisted:plan.resolution.durableRecord!==null,
        grantCount:plan.expectedGrantCount,
        payloadPurged:plan.requiresPayloadErasure,
      }));
      const response=await handleSeyeonPlannerMemoryDecisionRequestV1({
        request:send(mode),...metadata,pool:db.pool,
        identityEvidenceVerifier:{verifyRequestIdentity:async()=>MEMBER},
        approvedDecisionWrites:()=>true,
        loadVerifiedPlannerSource:load,commitDecision:commit,
      });
      expect(response.status).toBe(200);
      const json=await response.json();
      expect(json.data).toEqual({proposalId:PROPOSAL,decision:mode,
        status:'resolved',persisted:mode==='character_only'||mode==='current_characters',
        grantCount:mode==='character_only'?1:mode==='current_characters'?2:0});
      expect(db.queries).toContain('BEGIN');
      expect(db.queries).toContain('SET LOCAL ROLE myeongha_api_executor');
      expect(db.queries).toContain('COMMIT');
      expect(db.queries).not.toContain('ROLLBACK');
      expect(load).toHaveBeenCalledTimes(1);
      expect(commit).toHaveBeenCalledTimes(1);
      expect(db.release).toHaveBeenCalledTimes(1);
    });
  }

  it('rejects fake or stale server candidate with rollback, no decision write',async()=>{
    const db=makePool();
    const commit=vi.fn();
    const response=await handleSeyeonPlannerMemoryDecisionRequestV1({
      request:send('character_only'),...metadata,pool:db.pool,
      identityEvidenceVerifier:{verifyRequestIdentity:async()=>MEMBER},
      approvedDecisionWrites:()=>true,
      loadVerifiedPlannerSource:async()=>({
        candidate:{...CANDIDATE,status:'accepted' as never},
        currentEligibleCharacterIds:['seyeon'],
      }),
      commitDecision:commit,
    });
    expect(response.status).toBe(503);
    expect(db.queries).toContain('ROLLBACK');
    expect(db.queries).not.toContain('COMMIT');
    expect(commit).not.toHaveBeenCalled();
  });

  it('rejects incorrect receipt and atomically rolls back instead of returning success',async()=>{
    const db=makePool();
    const response=await handleSeyeonPlannerMemoryDecisionRequestV1({
      request:send('discard'),...metadata,pool:db.pool,
      identityEvidenceVerifier:{verifyRequestIdentity:async()=>MEMBER},
      approvedDecisionWrites:()=>true,
      loadVerifiedPlannerSource:async()=>({
        candidate:CANDIDATE,currentEligibleCharacterIds:['seyeon'],
      }),
      commitDecision:async()=>({
        proposalId:PROPOSAL,decision:'discard',status:'resolved',
        persisted:false,grantCount:0,payloadPurged:false,
      }),
    });
    expect(response.status).toBe(503);
    expect(db.queries).toContain('ROLLBACK');
    expect(db.queries).not.toContain('COMMIT');
  });
});
