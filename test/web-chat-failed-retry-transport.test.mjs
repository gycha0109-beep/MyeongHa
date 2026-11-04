import {describe,expect,it} from 'vitest';
import {sendSeyeonBrowserTurnWithReceiptV1} from '../apps/web/chat-turn-receipt-client.js';

const origin='https://myeongha.gycha0109.workers.dev';
const threadId='123e4567-e89b-42d3-a456-426614174000';
const turn={clientTurnId:'223e4567-e89b-42d3-a456-426614174000',text:'Try the original failed message'};

async function observeRetryHeaders(options={}) {
  const seen=[];
  await expect(sendSeyeonBrowserTurnWithReceiptV1({
    origin, bearer:'synthetic-member',threadId,turn,language:'ko-KR',localeHeaders:{},
    ...options,
    fetchImpl:async(url,requestOptions)=>{
      const record={url:new URL(String(url)),headers:new Headers(requestOptions.headers),method:requestOptions.method};
      seen.push(record);
      return Response.json({ok:false,error:{code:'IDEMPOTENCY_CONFLICT',retryable:false},
        meta:{apiContractVersion:'v0.9'}},{status:409,headers:{'Cache-Control':'no-store'}});
    },
  })).rejects.toThrow();
  expect(seen).toHaveLength(1);
  expect(seen[0].method).toBe('POST');
  expect(seen[0].url.pathname).toBe('/api/chat/'+threadId+'/turns');
  return seen[0].headers;
}

describe('Explicit retry never upgrades a normal send or receipt to another operation',()=>{
  it('marks only the owner-requested failed retry as a strict existing-turn recovery',async()=>{
    const headers=await observeRetryHeaders({retryFailed:true});
    expect(headers.get('X-MyeongHa-Seyeon-Explicit-Retry')).toBe('v1');
    expect(headers.has('X-MyeongHa-Seyeon-Explicit-Supersede')).toBe(false);
    expect(headers.get('x-myeongha-delivery-receipt')).toBe('v1');
  });
  it('does not opt normal sends into failed-turn recovery',async()=>{
    const headers=await observeRetryHeaders({});
    expect(headers.has('X-MyeongHa-Seyeon-Explicit-Retry')).toBe(false);
    expect(headers.has('X-MyeongHa-Seyeon-Explicit-Supersede')).toBe(false);
  });
  it('never mixes a retry with superseding another failed message',async()=>{
    const headers=await observeRetryHeaders({retryFailed:true,supersedeFailed:true});
    expect(headers.has('X-MyeongHa-Seyeon-Explicit-Retry')).toBe(false);
    expect(headers.get('X-MyeongHa-Seyeon-Explicit-Supersede')).toBe('v1');
  });
});
