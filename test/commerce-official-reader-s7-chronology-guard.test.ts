import {describe,expect,it,vi,beforeEach} from 'vitest';

vi.mock('../apps/api/src/official-reader-private-paid-answer-reread-v1.js',()=>({
  readPrivateOfficialReaderPaidChatMessageV1:vi.fn(),
}));
import {readPrivateOfficialReaderPaidChatMessageV1} from
  '../apps/api/src/official-reader-private-paid-answer-reread-v1.js';
import {handleOfficialReaderPaidChatMessageHttpV1} from
  '../apps/api/src/official-reader-paid-chat-message-http-v1.js';
import {readFileSync} from 'node:fs';

const THREAD='11111111-1111-4111-8111-111111111111';
const MARKER='22222222-2222-4222-8222-222222222222';
const REQUEST='33333333-3333-4333-8333-333333333333';
const ATTEMPT='44444444-4444-4444-8444-444444444444';
const READING='55555555-5555-4555-8555-555555555555';
const COMMITTED='2026-11-04T02:30:00.000Z';
const token='A'.repeat(43);
const prepared=(committedAt=COMMITTED,responsePreparedAt=COMMITTED)=>({
  bodyId:ATTEMPT,officialReadingId:READING,readerCharacterId:'seyeon',
  committedAt,body:'PROTECTED_READER_CONTENT',
  delivery:{contractVersion:'official-reader-s7-private-delivery-v1',
    deliveryRequestId:REQUEST,deliveryAttemptId:ATTEMPT,
    responsePreparedAt,acknowledgementToken:token,replayed:false},
});
function run(){
  return handleOfficialReaderPaidChatMessageHttpV1({
    request:new Request('https://reader.example.test/api/chat/'+THREAD+
      '/paid-readings/'+MARKER,{headers:{'X-Reader-Delivery-Request-Id':REQUEST}}),
    requestId:'test',serverTime:COMMITTED,paidReadReleaseEnabled:true,
    identityEvidenceVerifier:{
      verifyRequestIdentity:vi.fn(async()=>({
        kind:'member',verifiedAuthUserId:READING,
      })),
    } as never,
    pool:{} as never,keyResolver:{} as never,privacyLedgerPort:{} as never,
    deliveryTokenSecret:new Uint8Array(32),
  });
}

describe('Commerce paid Reader S5->S7 timestamp safety before HTTP presentation',()=>{
  beforeEach(()=>vi.clearAllMocks());
  it('returns only a private unavailable envelope for S7 preparation older than S5',async()=>{
    vi.mocked(readPrivateOfficialReaderPaidChatMessageV1)
      .mockResolvedValue(prepared('2026-11-04T02:31:00.000Z',COMMITTED) as never);
    const result=await run();
    expect(result.status).toBe(503);
    expect(result.headers.get('Cache-Control')).toContain('no-store');
    expect(await result.json()).toMatchObject({ok:false,error:{code:'CAPABILITY_UNAVAILABLE'}});
    expect(readPrivateOfficialReaderPaidChatMessageV1).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed or non-date S7 preparation without displaying paid content',async()=>{
    vi.mocked(readPrivateOfficialReaderPaidChatMessageV1)
      .mockResolvedValue(prepared(COMMITTED,'not-a-date') as never);
    const result=await run();
    expect(result.status).toBe(503);
    expect(JSON.stringify(await result.json())).not.toContain('PROTECTED_READER_CONTENT');
  });
  it('retains a valid S5 then S7 prepared receipt without calling an ACK',async()=>{
    vi.mocked(readPrivateOfficialReaderPaidChatMessageV1)
      .mockResolvedValue(prepared() as never);
    const result=await run();
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      ok:true,data:{committedAt:COMMITTED,
        delivery:{responsePreparedAt:COMMITTED,deliveryRequestId:REQUEST}},
    });
  });
  it('guards the private transaction before plaintext leaves the backend',()=>{
    const source=readFileSync(
      new URL('../apps/api/src/official-reader-private-paid-answer-reread-v1.ts',import.meta.url),
      'utf8',
    );
    const prep=source.indexOf('await prepareOfficialReaderPrivateDeliveryV1');
    const fence=source.indexOf('Date.parse(delivery.responsePreparedAt) < Date.parse(committedAt)');
    const privacy=source.indexOf('The independent outside-backup erasure ledger',prep);
    expect(prep).toBeGreaterThan(0);
    expect(fence).toBeGreaterThan(prep);
    expect(privacy).toBeGreaterThan(fence);
    expect(source).toContain(')) return unavailable();');
  });
});
