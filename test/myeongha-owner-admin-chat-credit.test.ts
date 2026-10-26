// Watchtower-Track: commerce-payment
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {readOwnerAdminAccessV1} from '../apps/api/src/myeongha-owner-admin-access-v1.js';
import {admitOwnerAwareChatCreditsV1} from '../apps/api/src/myeongha-owner-aware-chat-credit-v1.js';

const fixedSubject='1ab74118-b6fb-474d-ad9d-fede590056f3';
const fixedThread='123e4567-e89b-42d3-a456-426614174000';
const fixedTurn='223e4567-e89b-42d3-a456-426614174000';
const state=vi.hoisted(()=>({
  row:{isOwnerAdmin:false,chatCreditExempt:false,sandboxCheckoutAllowed:false},
  observed:[] as {text:string;values:readonly unknown[]|undefined}[],
  reserve:vi.fn(async()=>({kind:'reserved' as const,reservationId:'323e4567-e89b-42d3-a456-426614174000'})),
}));
vi.mock('../apps/api/src/postgres-subject-execution.js',()=>({
  executePostgresSubjectTransactionV1:async(input:{
    execute:(scope:unknown)=>Promise<unknown>;
  })=>input.execute({
    resolvedSubject:{subjectId:fixedSubject,subjectKind:'member'},
    client:{query:async(text:string,values?:readonly unknown[])=>{
      state.observed.push({text,values});
      return {rows:[state.row]};
    }},
  }),
}));
const pool={} as never;
const verifiedEvidence={kind:'member'} as never;
const input=()=>({
  pool,verifiedEvidence,verifiedSubjectId:fixedSubject,
  threadId:fixedThread,clientTurnId:fixedTurn,
  reservationPort:{reserveForReply:state.reserve},
});
beforeEach(()=>{
  state.row={isOwnerAdmin:false,chatCreditExempt:false,sandboxCheckoutAllowed:false};
  state.observed.length=0;
  state.reserve.mockClear();
});
describe('Owner Admin credits do not derive from client email',()=>{
  it('returns no privilege for guest before any DB call',async()=>{
    const r=await readOwnerAdminAccessV1(pool,{kind:'guest'} as never);
    expect(r).toMatchObject({isOwnerAdmin:false,chatCreditExempt:false,verifiedSubjectId:null});
    expect(state.observed).toHaveLength(0);
  });
  it('skips spending only for confirmed DB Owner Admin',async()=>{
    state.row={isOwnerAdmin:true,chatCreditExempt:true,sandboxCheckoutAllowed:true};
    const r=await admitOwnerAwareChatCreditsV1(input());
    expect(r).toEqual({kind:'owner_admin_exempt',requiredCredits:0});
    expect(state.reserve).not.toHaveBeenCalled();
    expect(state.observed[0]?.text).toContain('qry_myeongha_owner_admin_access_v1');
    expect(state.observed[0]?.values).toEqual([fixedSubject]);
  });
  it('requires standard credit reservation for every ordinary Member',async()=>{
    const r=await admitOwnerAwareChatCreditsV1(input());
    expect(r).toEqual({kind:'reservation',requiredCredits:10,reservationId:'323e4567-e89b-42d3-a456-426614174000'});
    expect(state.reserve).toHaveBeenCalledTimes(1);
    expect(state.reserve).toHaveBeenCalledWith(expect.objectContaining({
      verifiedSubjectId:fixedSubject,threadId:fixedThread,clientTurnId:fixedTurn,requiredCredits:10,
    }));
  });
  it('fails closed if claimed Member ID differs from the DB-resolved Subject',async()=>{
    await expect(admitOwnerAwareChatCreditsV1({...input(),verifiedSubjectId:fixedThread}))
      .rejects.toThrow('identity mismatch');
    expect(state.reserve).not.toHaveBeenCalled();
  });
  it('never grants privilege from inconsistent DB flags',async()=>{
    state.row={isOwnerAdmin:false,chatCreditExempt:true,sandboxCheckoutAllowed:false};
    await expect(admitOwnerAwareChatCreditsV1(input())).rejects.toThrow('Invalid owner access authority');
    expect(state.reserve).not.toHaveBeenCalled();
  });
});
