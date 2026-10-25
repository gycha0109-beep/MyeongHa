import {createHash} from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  MyeongHaApiClientV1,
  sendSeyeonChatTurnV1,
} from '../packages/api-client/src/index.js';

const THREAD_ID = '123e4567-e89b-42d3-a456-426614174000';
const CLIENT_TURN_ID = '223e4567-e89b-42d3-a456-426614174000';
const TURN_ID = '323e4567-e89b-42d3-a456-426614174000';
const MESSAGE_ID = '423e4567-e89b-42d3-a456-426614174000';

describe('shared Seyeon Chat turn-send client', () => {
  it('acknowledges only the fully parsed reply, strips its capability, and never sends a second model request',async()=>{
    const calls:Array<{path:string;headers:Headers;body:unknown}>=[];
    const proof='a'.repeat(64);
    const client=new MyeongHaApiClientV1({origin:'https://myeongha.test',fetchImpl:async(input,init)=>{
      const path=new URL(String(input)).pathname;
      calls.push({path,headers:new Headers(init?.headers),body:JSON.parse(String(init?.body))});
      if(calls.length===1)return Response.json({ok:true,data:{turnId:TURN_ID,assistantMessageId:MESSAGE_ID,
        assistantText:'received original',sequenceNo:2,replayed:false,
        deliveryReceipt:{attemptId:TURN_ID,challenge:proof}}});
      return Response.json({ok:true,data:{accepted:true}});
    }});
    const result=await sendSeyeonChatTurnV1(client,'member-bearer',THREAD_ID,{clientTurnId:CLIENT_TURN_ID,text:'hello'});
    expect(result.assistantText).toBe('received original');
    expect(result).not.toHaveProperty('deliveryReceipt');
    expect(calls).toHaveLength(2);
    expect(calls[0]?.headers.get('x-myeongha-delivery-receipt')).toBe('v1');
    expect(calls[1]?.path).toBe(`/api/chat/delivery-receipts/${TURN_ID}`);
    expect(calls[1]?.headers.get('Authorization')).toBeNull();
    const challengeHash=createHash('sha256').update(proof).digest('hex');
    const expected=createHash('sha256').update('seyeon-positive-http-receipt-v1\n'+Buffer.byteLength('received original')+':received original:'+challengeHash).digest('hex');
    expect(calls[1]?.body).toEqual({proof:expected});
  });

  it('does not ACK a truncated response or accept a forged receipt format',async()=>{
    for(const malformed of [true,false]){
      let calls=0;
      const client=new MyeongHaApiClientV1({origin:'https://myeongha.test',fetchImpl:async()=>{
        calls++;
        return malformed?new Response('{"ok":true,"data":'):
          Response.json({ok:true,data:{turnId:TURN_ID,assistantMessageId:MESSAGE_ID,
            assistantText:'original',sequenceNo:2,replayed:false,deliveryReceipt:{attemptId:TURN_ID,challenge:'forged'}}});
      }});
      await expect(sendSeyeonChatTurnV1(client,'member-bearer',THREAD_ID,{clientTurnId:CLIENT_TURN_ID,text:'hello'})).rejects.toThrow();
      expect(calls).toBe(1);
    }
  });
  it('sends no browser-owned authority fields', async () => {
    let method = '';
    let path = '';
    let body: unknown;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        method = init?.method ?? '';
        path = url.pathname;
        body = JSON.parse(String(init?.body));
        return Response.json({
          ok: true,
          data: {
            turnId: TURN_ID,
            assistantMessageId: MESSAGE_ID,
            assistantText: '세연 답변',
            sequenceNo: 2,
            replayed: false,
          },
        });
      },
    });

    await expect(sendSeyeonChatTurnV1(
      client,
      'member-bearer',
      THREAD_ID,
      { clientTurnId: CLIENT_TURN_ID, text: '안녕하세요.' },
    )).resolves.toEqual({
      turnId: TURN_ID,
      assistantMessageId: MESSAGE_ID,
      assistantText: '세연 답변',
      sequenceNo: 2,
      replayed: false,
    });
    expect(method).toBe('POST');
    expect(path).toBe(`/api/chat/${THREAD_ID}/turns`);
    expect(body).toEqual({ clientTurnId: CLIENT_TURN_ID, text: '안녕하세요.' });
  });

  it('rejects authority injection before network access', async () => {
    let calls = 0;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => { calls += 1; return Response.json({ ok: true, data: {} }); },
    });
    await expect(sendSeyeonChatTurnV1(
      client,
      'member-bearer',
      THREAD_ID,
      { clientTurnId: CLIENT_TURN_ID, text: 'hello', releaseId: 'client-owned' },
    )).rejects.toMatchObject({ code: 'CLIENT_CHAT_TURN_INVALID' });
    expect(calls).toBe(0);
  });
});
