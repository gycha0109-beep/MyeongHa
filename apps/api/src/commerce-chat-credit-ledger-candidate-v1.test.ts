import { describe, expect, it } from 'vitest';
import {
  issueMemberSignupCreditsCandidateV1,
  reserveMemberChatCreditsCandidateV1,
  settleDeliveredChatCreditsCandidateV1,
  releaseFailedChatCreditsCandidateV1,
} from './commerce-chat-credit-ledger-candidate-v1.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

const subject='11111111-1111-4111-8111-111111111111';
const thread='22222222-2222-4222-8222-222222222222';
const turn='33333333-3333-4333-8333-333333333333';
const reservation='44444444-4444-4444-8444-444444444444';
const delivered='55555555-5555-4555-8555-555555555555';
const lot='66666666-6666-4666-8666-666666666666';
const clientTurn={canonicalSubjectId:subject,canonicalSubjectKind:'member' as const,
  threadId:thread,clientTurnId:turn,requestId:'request-1'};

function db(rows: readonly (readonly Record<string,unknown>[])[]) {
  const calls: Array<{sql:string;args:readonly unknown[] | undefined}> = [];
  const client:PostgresTransactionQueryV1={
    async query<Row>(sql:string,args?:readonly unknown[]) {
      calls.push({sql,args});
      return {rows:(rows[calls.length-1]??[]) as readonly Row[]};
    },
  };
  return {client,calls};
}

describe('private chat credit candidate: signup, reserve and finalization',()=>{
  it('adopts existing Member signup credit exactly once via SQL authority and DB balance',async()=>{
    const t=db([[{lotId:lot}],[{availableCredits:'50',totalCredits:'50'}]]);
    expect(await issueMemberSignupCreditsCandidateV1({
      client:t.client,canonicalSubjectId:subject,canonicalSubjectKind:'member',
    })).toEqual({lotId:lot,availableCredits:50,totalCredits:50});
    expect(t.calls[0]?.sql).toContain('internal_cmd_chat_signup_credit_v1');
    expect(t.calls[0]?.args).toEqual([subject]);
    expect(t.calls[1]?.sql).toContain('internal_qry_chat_credit_balance_v1');
  });

  it('rejects Guest without accessing signup credit mint',async()=>{
    const t=db([]);
    await expect(issueMemberSignupCreditsCandidateV1({
      client:t.client,canonicalSubjectId:subject,canonicalSubjectKind:'guest',
    })).rejects.toThrow('Member');
    expect(t.calls).toHaveLength(0);
  });

  it('reserves ten credits atomically for an owned ClientTurn',async()=>{
    const t=db([[{outcome:'reserved',reservationId:reservation,
      committedTurnId:null,availableCredits:'40',totalCredits:'40'}]]);
    expect(await reserveMemberChatCreditsCandidateV1({
      ...clientTurn,client:t.client,
    })).toEqual({outcome:'reserved',reservationId:reservation});
    expect(t.calls[0]?.args).toEqual([subject,thread,turn]);
  });

  it('returns actual 402 with unsaleable 1900 KRW top-up on shortage',async()=>{
    const t=db([[{outcome:'insufficient',reservationId:null,
      committedTurnId:null,availableCredits:'0',totalCredits:'50'}]]);
    const result=await reserveMemberChatCreditsCandidateV1({
      ...clientTurn,client:t.client,
    });
    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw Error('expected HTTP 402');
    expect(result.status).toBe(402);
    const data=await result.json();
    expect(data.error.code).toBe('CREDIT_INSUFFICIENT');
    expect(data.data.topUp).toMatchObject({
      amountMinor:1900,currency:'KRW',creditQuantity:300,saleable:false,
    });
    expect(data.data.resume).toEqual({threadId:thread,clientTurnId:turn});
  });

  it('never settles a committed-only turn without delivery proof',async()=>{
    const t=db([[]]);
    await expect(settleDeliveredChatCreditsCandidateV1({
      client:t.client,canonicalSubjectId:subject,
      reservationId:reservation,deliveredTurnId:delivered,
    })).rejects.toThrow('delivery proof');
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]?.sql).toContain("ct.state='delivered'");
  });

  it('settles exactly one verified delivered turn',async()=>{
    const t=db([[{turnId:delivered}],[{state:'settled'}]]);
    expect(await settleDeliveredChatCreditsCandidateV1({
      client:t.client,canonicalSubjectId:subject,
      reservationId:reservation,deliveredTurnId:delivered,
    })).toBe('settled');
    expect(t.calls[1]?.args).toEqual([subject,reservation,true,delivered]);
  });

  it('never releases a turn with no definitive failed-delivery state',async()=>{
    const t=db([[]]);
    await expect(releaseFailedChatCreditsCandidateV1({
      client:t.client,canonicalSubjectId:subject,reservationId:reservation,
    })).rejects.toThrow('non-delivery proof');
    expect(t.calls).toHaveLength(1);
  });

  it('restores credits only with failed ChatTurn evidence',async()=>{
    const t=db([[{reservationId:reservation}],[{state:'released'}]]);
    expect(await releaseFailedChatCreditsCandidateV1({
      client:t.client,canonicalSubjectId:subject,reservationId:reservation,
    })).toBe('released');
    expect(t.calls[1]?.args).toEqual([subject,reservation,false,null]);
  });
});
