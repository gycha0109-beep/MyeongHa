import {describe,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {sendSeyeonBrowserTurnWithReceiptV1} from '../apps/web/chat-turn-receipt-client.js';
import {createSeyeonAcknowledgedTurnPresentationV1} from '../apps/web/seyeon-receipt-presentation.js';

const threadId='123e4567-e89b-42d3-a456-426614174000';
const clientTurnId='223e4567-e89b-42d3-a456-426614174000';
const turnId='323e4567-e89b-42d3-a456-426614174000';
const assistantMessageId='423e4567-e89b-42d3-a456-426614174000';

describe('Se-yeon S0 ACK-only single-turn browser UX',()=>{
  it('never calls an unreceipted 200 JSON reply a successful send',async()=>{
    let requests=0;
    await expect(sendSeyeonBrowserTurnWithReceiptV1({
      origin:'https://myeongha.gycha0109.workers.dev',bearer:'test-member',
      threadId,turn:{clientTurnId,text:'Hello'},language:'ko-KR',localeHeaders:{},
      fetchImpl:async()=>{
        requests++;
        return Response.json({ok:true,data:{
          turnId,assistantMessageId,assistantText:'unreceipted answer',
          sequenceNo:2,replayed:false,
        }});
      },
    })).rejects.toThrow('SEYEON_RECEIPT_ACK_REQUIRED');
    expect(requests).toBe(1);
  });

  it('shows only the committed ACKed turn in short-lived presentation',()=>{
    const pending={clientTurnId,text:'내가 보낸 이번 문장'};
    const received={turnId,assistantMessageId,assistantText:'이번에 받은 답변',
      sequenceNo:2,replayed:false};
    const messages=createSeyeonAcknowledgedTurnPresentationV1(
      pending,received,new Date('2026-10-25T15:00:00.000Z'));
    expect(messages).toHaveLength(2);
    expect(messages.map(m=>m.bodyText)).toEqual([
      pending.text,received.assistantText,
    ]);
    expect(messages.map(m=>m.senderType)).toEqual(['user','character']);
    expect(messages.every(m=>m.receiptOnly===true)).toBe(true);
    expect(messages[1]?.characterId).toBe('seyeon');
    expect(messages[1]).not.toHaveProperty('messageId');
    expect(messages[1]).not.toHaveProperty('deliveryReceipt');
    expect(()=>createSeyeonAcknowledgedTurnPresentationV1(pending,{
      ...received,replayed:true,
    })).toThrow('SEYEON_ACKED_TURN_PRESENTATION_INVALID');
  });

  it('does not re-read protected History or retry after a receipt ACK',async()=>{
    const source=await readFile(new URL('../apps/web/chat-runtime-client.js',
      import.meta.url),'utf8');
    const beginning=source.indexOf('async function sendTurn(message)');
    const ending=source.indexOf('function submitTurn(event)',beginning);
    expect(beginning).toBeGreaterThan(0);
    expect(ending).toBeGreaterThan(beginning);
    const send=source.slice(beginning,ending);
    expect(send).toContain('createSeyeonAcknowledgedTurnPresentationV1');
    expect(send).not.toContain('await loadRoomState()');
    expect(send.indexOf('createSeyeonAcknowledgedTurnPresentationV1'))
      .toBeLessThan(send.lastIndexOf('clearPendingTurn(pendingTurn.clientTurnId)'));
  });
});
