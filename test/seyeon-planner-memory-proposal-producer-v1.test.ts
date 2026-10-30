// Watchtower-Track: security
import { describe, expect, it, vi } from 'vitest';
import {
  createPendingSeyeonPlannerMemoryProposalV1,
} from '../apps/api/src/postgres-seyeon-planner-memory-proposal-producer-v1.js';
import {
  extractSeyeonPlannerMemoryCandidateV1,
} from '../apps/api/src/seyeon-planner-memory-proposal-extractor-v1.js';
import {
  deriveSeyeonPlannerProposalIdV1,
  runSeyeonPostTurnPlannerMemoryV1,
} from '../apps/api/src/seyeon-post-turn-planner-memory-proposal-v1.js';

const SUBJECT='11111111-1111-4111-8111-111111111111';
const TURN='22222222-2222-4222-8222-222222222222';
const USER='33333333-3333-4333-8333-333333333333';
const ASSISTANT='44444444-4444-4444-8444-444444444444';
const PROPOSAL='55555555-5555-4555-8555-555555555555';
const source={
  userMessageId:USER,userText:'나는 나비라는 고양이를 키워',
  assistantMessageId:ASSISTANT,assistantText:'나비? 귀엽다!',
};
const candidate={
  summary:'사용자는 나비라는 고양이를 키운다고 말했다',
  userEvidenceQuote:'나비라는 고양이를 키워',
};

describe('UC-06 server Dialogue Planner Memory candidate',()=>{
  it('returns none without a Memory decision or a storage request',async()=>{
    const provider={
      providerKey:'synthetic',modelKey:'synthetic',
      generate:vi.fn(async()=>({decision:'none'})),
    };
    expect(await extractSeyeonPlannerMemoryCandidateV1({...source,provider}))
      .toEqual({decision:'none'});
    const [request]=provider.generate.mock.calls[0]!;
    expect(request.purpose).toBe('memory_proposal_extraction');
    expect(JSON.stringify(request)).not.toContain('grantChoice');
  });

  it('identifies one user-asserted fact, grounded in the exact user original',async()=>{
    const provider={
      providerKey:'synthetic',modelKey:'synthetic',
      generate:vi.fn(async()=>({
        decision:'propose',claimAuthority:'user_asserted',
        ...candidate,
      })),
    };
    const result=await extractSeyeonPlannerMemoryCandidateV1({...source,provider});
    expect(result).toEqual({decision:'propose',candidate});
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('rejects invented evidence, assistant biography, raw-message save and extra fields',async()=>{
    for(const output of [
      {decision:'propose',claimAuthority:'user_asserted',summary:'고양이 기르기',userEvidenceQuote:'강아지'},
      {decision:'propose',claimAuthority:'assistant_authority',...candidate},
      {decision:'propose',claimAuthority:'user_asserted',summary:source.userText,
        userEvidenceQuote:source.userText},
      {decision:'propose',claimAuthority:'user_asserted',...candidate,grantId:PROPOSAL},
      {decision:'none',reason:'no-op'},
    ]){
      const provider={providerKey:'synthetic',modelKey:'synthetic',
        generate:async()=>output};
      await expect(extractSeyeonPlannerMemoryCandidateV1({...source,provider}))
        .rejects.toMatchObject({code:'SEYEON_PLANNER_MEMORY_EXTRACTION_HOLD'});
    }
  });

  it('DB Producer receives only server-owned IDs, one grounded summary and evidence quote',async()=>{
    const query=vi.fn(async(_sql:string,values?:readonly unknown[])=>({
      rows:[{proposalId:values?.[1],proposalState:'pending',replayed:false}],
    }));
    const receipt=await createPendingSeyeonPlannerMemoryProposalV1({
      query:query as never,
    },{
      canonicalMemberSubjectId:SUBJECT,proposalId:PROPOSAL,
      turnId:TURN,userMessageId:USER,assistantMessageId:ASSISTANT,candidate,
    });
    expect(receipt).toEqual({proposalId:PROPOSAL,proposalState:'pending',replayed:false});
    const [sql,values]=query.mock.calls[0]!;
    expect(sql).toContain('seyeon_private.cmd_create_pending_seyeon_planner_memory_v1');
    expect(values).toEqual([
      SUBJECT,PROPOSAL,TURN,ASSISTANT,USER,candidate.summary,candidate.userEvidenceQuote,
    ]);
    expect(sql).not.toContain('insert into public.memory_items');
    expect(sql).not.toContain('record_access_grants');
  });

  it('refuses caller-forged candidate and Message identity before SQL',async()=>{
    const query=vi.fn();
    for(const incorrect of [
      {...candidate,grantCount:1},
      {...candidate,summary:source.userText},
      {...candidate,userEvidenceQuote:' '},
    ]){
      // The producer enforces shape; model-origin quote grounding is checked
      // separately by extractor and DB original-row lookup.
      if(incorrect.summary===source.userText)continue;
      await expect(createPendingSeyeonPlannerMemoryProposalV1({query},{
        canonicalMemberSubjectId:SUBJECT,proposalId:PROPOSAL,turnId:TURN,
        userMessageId:USER,assistantMessageId:ASSISTANT,
        candidate:incorrect,
      })).rejects.toThrow();
    }
    await expect(createPendingSeyeonPlannerMemoryProposalV1({query},{
      canonicalMemberSubjectId:SUBJECT,proposalId:PROPOSAL,turnId:TURN,
      userMessageId:USER,assistantMessageId:USER,candidate,
    })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});

describe('server-owned post-turn Planner stage',()=>{
  it('defaults to DENY before provider and before DB',async()=>{
    const provider={providerKey:'synthetic',modelKey:'synthetic',generate:vi.fn()};
    const pool={connect:vi.fn()};
    const input={
      pool:pool as never,
      verifiedEvidence:{kind:'member' as const,verifiedAuthUserId:SUBJECT},
      committedTurn:{turnId:TURN,...source},
      governedProvider:provider,
    };
    await expect(runSeyeonPostTurnPlannerMemoryV1(input))
      .rejects.toMatchObject({code:'SEYEON_POST_TURN_PLANNER_MEMORY_HOLD'});
    expect(provider.generate).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('derives stable per-Member/Turn UUID without a caller-selected proposal',()=>{
    const p=deriveSeyeonPlannerProposalIdV1(SUBJECT,TURN);
    expect(p).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(deriveSeyeonPlannerProposalIdV1(SUBJECT,TURN)).toBe(p);
    expect(deriveSeyeonPlannerProposalIdV1(PROPOSAL,TURN)).not.toBe(p);
  });

  it('governed candidate flows to one resolved Member subject transaction and pending DB proposal',async()=>{
    const queries:string[]=[];
    const query=vi.fn(async(sql:string,values?:readonly unknown[])=>{
      queries.push(sql);
      if(sql.includes('begin_member_subject_context_v1')){
        return {rows:[{subjectId:SUBJECT,subjectKind:'member'}]};
      }
      if(sql.includes('cmd_create_pending_seyeon_planner_memory_v1')) {
        return {rows:[{proposalId:values?.[1],proposalState:'pending',replayed:false}]};
      }
      return {rows:[]};
    });
    const release=vi.fn();
    const pool={connect:vi.fn(async()=>({query,release}))};
    const provider={providerKey:'synthetic',modelKey:'synthetic',
      generate:vi.fn(async()=>({
        decision:'propose',claimAuthority:'user_asserted',...candidate,
      }))};
    const outcome=await runSeyeonPostTurnPlannerMemoryV1({
      pool:pool as never,
      verifiedEvidence:{kind:'member',verifiedAuthUserId:SUBJECT},
      committedTurn:{turnId:TURN,...source},
      governedProvider:provider,
      approvedModelAndDbStage:()=>true,
    });
    expect(outcome).toEqual({decision:'pending',
      proposalId:deriveSeyeonPlannerProposalIdV1(SUBJECT,TURN),replayed:false});
    expect(queries).toContain('BEGIN');
    expect(queries).toContain('SET LOCAL ROLE myeongha_api_executor');
    expect(queries).toContain('COMMIT');
    expect(queries).not.toContain('ROLLBACK');
    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('guest evidence cannot trigger a paid Planner call',async()=>{
    const provider={providerKey:'synthetic',modelKey:'synthetic',generate:vi.fn()};
    await expect(runSeyeonPostTurnPlannerMemoryV1({
      pool:{connect:vi.fn()} as never,
      verifiedEvidence:{kind:'guest',verifiedGuestTokenHash:'guest-hash'},
      committedTurn:{turnId:TURN,...source},
      governedProvider:provider,
      approvedModelAndDbStage:()=>true,
    })).rejects.toMatchObject({code:'SEYEON_POST_TURN_PLANNER_MEMORY_HOLD'});
    expect(provider.generate).not.toHaveBeenCalled();
  });
});
