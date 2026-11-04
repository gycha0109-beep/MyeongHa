import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('@/core/runtime/native-mobile-runtime', () => ({
  nativeMobileRuntimeV1: {
    config: { apiOrigin: 'https://reader.example.test' },
    memberSession: {
      async withMemberBearer<T>(operation: (bearer: string) => Promise<T>): Promise<T> {
        return operation('member.jwt.token');
      },
    },
  },
}));
vi.mock('@/core/config/mobile-runtime-config', () => ({
  resolveMobileApiOriginV1: (value: string) => value,
}));

import {
  createMobilePaidReaderDeliveryRequestIdV1,
} from '../apps/mobile/src/features/chat/mobile-paid-reader-delivery-id.js';
import {
  acknowledgeMobilePaidReaderChatDeliveryV1,
  readMobilePaidReaderChatMessageV1,
} from '../apps/mobile/src/features/chat/mobile-paid-reader-delivery-service.js';

const THREAD='11111111-1111-4111-8111-111111111111';
const MARKER='22222222-2222-4222-8222-222222222222';
const DELIVERY='33333333-3333-4333-8333-333333333333';
const READING='44444444-4444-4444-8444-444444444444';
const REQUEST='55555555-5555-4555-8555-555555555555';
const TOKEN='A'.repeat(43);
const CREATED='2026-11-04T02:30:00.000Z';
const BASE='https://reader.example.test/api/chat/'+THREAD+'/paid-readings/'+MARKER;

afterEach(()=>{vi.unstubAllGlobals();});

describe('native paid Reader delivery: protected S6 GET and S7 ACK',()=>{
  it('uses a cryptographically generated UUID, never the ordinary Chat fallback',()=>{
    vi.stubGlobal('crypto', {randomUUID:()=>REQUEST});
    expect(createMobilePaidReaderDeliveryRequestIdV1()).toBe(REQUEST);
    const source=readFileSync(new URL('../apps/mobile/src/features/chat/mobile-paid-reader-delivery-id.ts', import.meta.url),'utf8');
    expect(source).not.toContain('Math.random(');
    expect(source).not.toContain('createMobileChatTurnIdV1(');
  });

  it('uses securely sampled UUID v4 bytes where randomUUID is absent',()=>{
    const getRandomValues=vi.fn((bytes:Uint8Array)=>{
      bytes.set([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]);
      return bytes;
    });
    vi.stubGlobal('crypto',{getRandomValues});
    expect(createMobilePaidReaderDeliveryRequestIdV1())
      .toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });

  it('fails before any paid answer request without a cryptographic source',async()=>{
    vi.stubGlobal('crypto',undefined);
    const fetchImpl=vi.fn();
    vi.stubGlobal('fetch',fetchImpl);
    await expect(readMobilePaidReaderChatMessageV1({
      threadId:THREAD,safeMessageId:MARKER,signal:new AbortController().signal,
    })).rejects.toThrow('Secure Reader delivery request identity unavailable');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('requests paid content and acknowledges client layout with Bearer, no ambient Cookie',async()=>{
    vi.stubGlobal('crypto',{randomUUID:()=>REQUEST});
    const fetchImpl=vi.fn(async (url:RequestInfo|URL,init?:RequestInit)=>{
      const headers=new Headers(init?.headers);
      expect(init?.credentials).toBe('omit');
      expect(headers.get('Cookie')).toBeNull();
      expect(headers.get('Authorization')).toBe('Bearer member.jwt.token');
      if(init?.method==='GET'){
        expect(String(url)).toBe(BASE);
        expect(headers.get('X-Reader-Delivery-Request-Id')).toBe(REQUEST);
        return Response.json({
          ok:true,
          data:{
            schemaVersion:'official-reader-paid-chat-message-v1',
            threadId:THREAD,safeMessageId:MARKER,
            officialReadingId:READING,readerCharacterId:'seyeon',
            committedAt:CREATED,body:'PRIVATE_READING_CONTENT',
            delivery:{
              deliveryRequestId:REQUEST,deliveryAttemptId:DELIVERY,
              responsePreparedAt:CREATED,acknowledgementToken:TOKEN,
              replayed:false,
            },
          },
        });
      }
      expect(init?.method).toBe('POST');
      expect(String(url)).toBe(BASE+'/ack');
      expect(headers.get('X-Reader-Delivery-Ack')).toBe('1');
      expect(JSON.parse(String(init?.body))).toEqual({
        schemaVersion:'official-reader-s7-private-delivery-v1',
        deliveryAttemptId:DELIVERY,deliveryRequestId:REQUEST,
        acknowledgementToken:TOKEN,
      });
      return Response.json({
        ok:true,data:{
          schemaVersion:'official-reader-s7-private-delivery-v1',
          deliveryAttemptId:DELIVERY,clientAcknowledgedAt:CREATED,replayed:false,
        },
      });
    });
    vi.stubGlobal('fetch',fetchImpl);

    const read=await readMobilePaidReaderChatMessageV1({
      threadId:THREAD,safeMessageId:MARKER,signal:new AbortController().signal,
    });
    expect(read.kind).toBe('ready');
    if(read.kind!=='ready')throw Error('Paid answer missing');
    const ack=await acknowledgeMobilePaidReaderChatDeliveryV1({
      threadId:THREAD,safeMessageId:MARKER,receipt:read.answer.delivery,
      signal:new AbortController().signal,
    });
    expect(ack).toMatchObject({kind:'acknowledged',replayed:false});
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('never treats an ACK receipt as statutory proof of human consumption',()=>{
    const source=readFileSync(new URL('../apps/mobile/src/features/chat/mobile-paid-reader-chat-reveal.tsx',import.meta.url),'utf8');
    expect(source).toContain('This is NOT evidence a');
    expect(source).toContain('cannot mark S5 committed_at as delivered_at');
    const service=readFileSync(new URL('../apps/mobile/src/features/chat/mobile-paid-reader-delivery-service.ts',import.meta.url),'utf8');
    expect(service).toContain('credentials:');
    expect((service.match(/credentials: 'omit'/gu)??[])).toHaveLength(2);
  });
});
