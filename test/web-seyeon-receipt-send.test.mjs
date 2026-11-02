import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {sendSeyeonBrowserTurnWithReceiptV1} from '../apps/web/chat-turn-receipt-client.js';

const threadId='123e4567-e89b-42d3-a456-426614174000';
const clientTurnId='223e4567-e89b-42d3-a456-426614174000';
const turnId='323e4567-e89b-42d3-a456-426614174000';
const assistantMessageId='423e4567-e89b-42d3-a456-426614174000';

describe('Cloudflare web Seyeon receipt-aware send',()=>{
  it('sends an ACK only after validated full reply, preserving locale and same-origin credentials',async()=>{
    const observed=[];
    const assistantText='답변: 노란 모자와 한강';
    const challenge='a'.repeat(64);
    const result=await sendSeyeonBrowserTurnWithReceiptV1({
      origin:'https://myeongha.gycha0109.workers.dev',bearer:'test-member-bearer',
      threadId,turn:{clientTurnId,text:'기억나요?'},language:'ko-KR',
      localeHeaders:{'X-MyeongHa-Ui-Locale':'ko-KR'},
      fetchImpl:async(url,options)=>{
        observed.push({url:new URL(String(url)),options,headers:new Headers(options?.headers)});
        if(observed.length===1){
          return Response.json({ok:true,data:{turnId,assistantMessageId,assistantText,
            sequenceNo:2,replayed:false,deliveryReceipt:{attemptId:turnId,challenge}}});
        }
        return Response.json({ok:true,data:{accepted:true}});
      },
    });
    expect(result.assistantText).toBe(assistantText);
    expect(result).not.toHaveProperty('deliveryReceipt');
    expect(observed).toHaveLength(2);
    for(const record of observed){
      expect(record.options.credentials).toBe('same-origin');
      expect(record.options.cache).toBe('no-store');
      expect(record.headers.get('Accept-Language')).toBe('ko-KR');
      expect(record.headers.get('X-MyeongHa-Ui-Locale')).toBe('ko-KR');
    }
    expect(observed[0].url.pathname).toBe(`/api/chat/${threadId}/turns`);
    expect(observed[0].headers.get('Authorization')).toBe('Bearer test-member-bearer');
    expect(observed[0].headers.get('x-myeongha-delivery-receipt')).toBe('v1');
    expect(observed[1].url.pathname).toBe(`/api/chat/delivery-receipts/${turnId}`);
    expect(observed[1].headers.has('Authorization')).toBe(false);
    const receiptProof=createHash('sha256').update('seyeon-positive-http-receipt-v1\n'+
      Buffer.byteLength(assistantText)+':'+assistantText+':'+
      createHash('sha256').update(challenge).digest('hex')).digest('hex');
    expect(JSON.parse(String(observed[1].options.body))).toEqual({proof:receiptProof});
  });

  it('rejects an unreceipted 200 as unconfirmed first reply without a history GET or retry',async()=>{
    const urls=[];
    await expect(sendSeyeonBrowserTurnWithReceiptV1({
      origin:'https://myeongha.gycha0109.workers.dev',
      bearer:'test-member-bearer',
      threadId,turn:{clientTurnId,text:'원본 기억을 다시 알려줘'},
      language:'ko-KR',localeHeaders:{},
      fetchImpl:async(url)=>{
        urls.push(new URL(String(url)).pathname);
        return Response.json({ok:true,data:{
          turnId,assistantMessageId,assistantText:'unreceipted positive',
          sequenceNo:2,replayed:false,
        }});
      },
    })).rejects.toThrow();
    expect(urls).toEqual([`/api/chat/${threadId}/turns`]);
  });

  it('never ACKs malformed replies and never repeats the model request after an ACK failure',async()=>{
    for(const mode of ['truncated','ack-failure']){
      const calls=[];
      await expect(sendSeyeonBrowserTurnWithReceiptV1({
        origin:'https://myeongha.gycha0109.workers.dev',bearer:'test-bearer',threadId,
        turn:{clientTurnId,text:'hello'},language:'ko-KR',localeHeaders:{},
        fetchImpl:async(url)=>{
          calls.push(new URL(String(url)).pathname);
          if(calls.length===1){
            return mode==='truncated' ? new Response('{"ok":true,"data":') :
              Response.json({ok:true,data:{turnId,assistantMessageId,assistantText:'안녕하세요',
                sequenceNo:2,replayed:false,
                deliveryReceipt:{attemptId:turnId,challenge:'b'.repeat(64)}}});
          }
          return Response.json({ok:false,error:{code:'INVALID_DELIVERY_RECEIPT',retryable:false}}, {status:503});
        },
      })).rejects.toThrow();
      expect(calls).toHaveLength(mode==='truncated'?1:2);
      expect(calls[0]).toBe(`/api/chat/${threadId}/turns`);
    }
  });
});
