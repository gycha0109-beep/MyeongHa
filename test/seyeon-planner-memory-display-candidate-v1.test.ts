// Watchtower-Track: security
import {describe,expect,it,vi} from 'vitest';
import {
  inspectSeyeonPlannerDisplayCandidateS0V1,
  SEYEON_PLANNER_MEMORY_DISPLAY_CANDIDATE_V1,
} from '../apps/api/src/postgres-seyeon-planner-memory-display-candidate-v1.js';

const SUBJECT='11111111-1111-4111-8111-111111111111';
const THREAD='22222222-2222-4222-8222-222222222222';
const ASSISTANT='33333333-3333-4333-8333-333333333333';
const PROPOSAL='44444444-4444-4444-8444-444444444444';
const args={canonicalMemberSubjectId:SUBJECT,threadId:THREAD,
  assistantMessageId:ASSISTANT};
const record={proposalId:PROPOSAL,subjectId:SUBJECT,threadId:THREAD,
  assistantMessageId:ASSISTANT,proposalKind:'memory',summary:'사용자는 나비를 기른다'};

describe('UC-06 S0 internal Planner display candidate is NOT G3 Reveal',()=>{
  it('does not query or disclose anything without internal S0 authority',async()=>{
    const query=vi.fn();
    await expect(inspectSeyeonPlannerDisplayCandidateS0V1({
      client:{query} as never,...args,
    })).rejects.toMatchObject({code:'SEYEON_PLANNER_DISPLAY_CANDIDATE_HOLD'});
    expect(query).not.toHaveBeenCalled();
    expect(SEYEON_PLANNER_MEMORY_DISPLAY_CANDIDATE_V1.productionMounted).toBe(false);
    expect(SEYEON_PLANNER_MEMORY_DISPLAY_CANDIDATE_V1.httpDisclosureAuthorized).toBe(false);
  });

  it('pins candidate to exact server Member/thread/assistant and rejects browser-shaped output',async()=>{
    const query=vi.fn(async(_sql:string,_values?:readonly unknown[])=>({rows:[record]}));
    const found=await inspectSeyeonPlannerDisplayCandidateS0V1({
      client:{query} as never,...args,
      approvedInternalS0Inspection:()=>true,
    });
    expect(found).toEqual({
      sourceAuthority:'db_owner_planner_inspection_only',
      disclosureAuthorized:false,
      subjectId:SUBJECT,threadId:THREAD,assistantMessageId:ASSISTANT,
      proposalId:PROPOSAL,proposalKind:'memory',
      summary:record.summary,
    });
    expect(Object.isFrozen(found)).toBe(true);
    expect((found as unknown as Record<string,unknown>).memoryProposal).toBeUndefined();
    expect(query.mock.calls[0]?.[0])
      .toContain('qry_pending_seyeon_planner_display_candidate_v1');
    expect(query.mock.calls[0]?.[1]).toEqual([SUBJECT,THREAD,ASSISTANT]);
  });

  it('treats no pending Owner-created proposal as absent without leaking history',async()=>{
    const query=vi.fn(async()=>({rows:[]}));
    const result=await inspectSeyeonPlannerDisplayCandidateS0V1({
      client:{query} as never,...args,
      approvedInternalS0Inspection:async()=>true,
    });
    expect(result).toBeNull();
  });

  it('refuses cross-Member, cross-thread, wrong assistant, forged summary and ambiguity',async()=>{
    for(const rows of [
      [{...record,subjectId:THREAD}],
      [{...record,threadId:SUBJECT}],
      [{...record,assistantMessageId:SUBJECT}],
      [{...record,proposalId:'not-a-uuid'}],
      [{...record,summary:'\u0000private'}],
      [record,record],
    ]){
      const query=vi.fn(async()=>({rows}));
      await expect(inspectSeyeonPlannerDisplayCandidateS0V1({
        client:{query} as never,...args,
        approvedInternalS0Inspection:()=>true,
      })).rejects.toMatchObject({code:'SEYEON_PLANNER_DISPLAY_CANDIDATE_HOLD'});
    }
  });
});
