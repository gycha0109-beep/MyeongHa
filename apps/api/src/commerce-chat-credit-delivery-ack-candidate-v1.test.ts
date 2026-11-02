import {describe,expect,it} from 'vitest';
import {acknowledgeDeliveredChatCreditCandidateV1} from './commerce-chat-credit-delivery-ack-candidate-v1.js';
import type {PostgresTransactionQueryV1} from './postgres-subject-execution.js';

const s='11111111-1111-4111-8111-111111111111';
const thread='22222222-2222-4222-8222-222222222222';
const turn='33333333-3333-4333-8333-333333333333';
const reservation='44444444-4444-4444-8444-444444444444';
const committed='55555555-5555-4555-8555-555555555555';
const message='66666666-6666-4666-8666-666666666666';
const args={canonicalSubjectId:s,canonicalSubjectKind:'member' as const,
  threadId:thread,clientTurnId:turn,creditReservationId:reservation,
  committedTurnId:committed,committedAssistantMessageId:message};
function db(state:unknown) {
  const calls:Array<{sql:string,args:readonly unknown[]|undefined}>=[];
  const client:PostgresTransactionQueryV1={
    async query<Row>(sql:string,args?:readonly unknown[]) {
      calls.push({sql,args});
      return {rows:[{state}] as unknown as readonly Row[]};
    },
  };
  return {client,calls};
}
describe('Chat credit delivered acknowledgement candidate',()=>{
  it('settles one authoritative delivered assistant and exactly ten credits',async()=>{
    const t=db('settled');
    expect(await acknowledgeDeliveredChatCreditCandidateV1({...args,client:t.client}))
      .toEqual({kind:'settled',creditsCharged:10});
    expect(t.calls[0]?.args).toEqual([s,thread,turn,reservation,committed,message]);
    expect(t.calls[0]?.sql).toContain('internal_cmd_chat_credit_ack_delivered_proven_v2');
  });
  it('never admits a Guest acknowledgement',async()=>{
    const t=db('settled');
    await expect(acknowledgeDeliveredChatCreditCandidateV1({
      ...args,canonicalSubjectKind:'guest',client:t.client,
    })).rejects.toThrow('Member');
    expect(t.calls).toHaveLength(0);
  });
  it('does not report charge if SQL denies or returns malformed status',async()=>{
    const t=db('released');
    await expect(acknowledgeDeliveredChatCreditCandidateV1({...args,client:t.client}))
      .rejects.toThrow('not settled');
  });
  it('rejects invalid client Turn ID before DB mutation',async()=>{
    const t=db('settled');
    await expect(acknowledgeDeliveredChatCreditCandidateV1({
      ...args,clientTurnId:'not-a-uuid',client:t.client,
    })).rejects.toThrow('ClientTurn');
    expect(t.calls).toHaveLength(0);
  });
});
