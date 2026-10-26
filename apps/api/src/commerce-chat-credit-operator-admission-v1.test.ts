import {describe,it,expect,vi} from 'vitest';
import {reserveChatCreditsOrOperatorV1} from './commerce-chat-credit-operator-admission-v1.js';
const subjectId='11111111-1111-4111-8111-111111111111';
const threadId='22222222-2222-4222-8222-222222222222';
const clientTurnId='33333333-3333-4333-8333-333333333333';

function fixture(freeChat:boolean) {
 const query=vi.fn(async()=>({rows:[{freeChat,sandboxCheckout:freeChat}]}));
 const reserveForReply=vi.fn(async()=>({
   kind:'reserved' as const,reservationId:'44444444-4444-4444-8444-444444444444',
 }));
 return {query,reserveForReply};
}
describe('operator free use never debits ordinary credits',()=>{
 it('allows exact server-approved operator without reserving credits',async()=>{
  const f=fixture(true);
  const result=await reserveChatCreditsOrOperatorV1({
    client:{query:async<Row>()=>({rows:(await f.query()).rows as Row[]})},verifiedSubjectId:subjectId,
    verifiedSubjectKind:'member',threadId,clientTurnId,
    port:{reserveForReply:f.reserveForReply},
  });
  expect(result).toEqual({kind:'operator_free',creditsReserved:0});
  expect(f.reserveForReply).not.toHaveBeenCalled();
  expect(f.query).toHaveBeenCalledOnce();
 });
 it('ordinary member requires exact atomic 10-credit reservation',async()=>{
  const f=fixture(false);
  const result=await reserveChatCreditsOrOperatorV1({
    client:{query:async<Row>()=>({rows:(await f.query()).rows as Row[]})},verifiedSubjectId:subjectId,
    verifiedSubjectKind:'member',threadId,clientTurnId,
    port:{reserveForReply:f.reserveForReply},
  });
  expect(result.kind).toBe('reservation');
  expect(f.reserveForReply).toHaveBeenCalledWith({
    verifiedSubjectId:subjectId,threadId,clientTurnId,requiredCredits:10,
  });
 });
 it('invalid or unavailable authority fails without credit use',async()=>{
  const f=fixture(true);
  await expect(reserveChatCreditsOrOperatorV1({
    client:{query:async<Row>()=>({rows:(await f.query()).rows as Row[]})},verifiedSubjectId:'gycha0109@gmail.com',
    verifiedSubjectKind:'member',threadId,clientTurnId,
    port:{reserveForReply:f.reserveForReply},
  })).rejects.toThrow();
  expect(f.reserveForReply).not.toHaveBeenCalled();
 });
});
